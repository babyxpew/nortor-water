/** Nortor by faii — NEW independent store. Google Sheets-bound Apps Script. */
const N = Object.freeze({
  BRAND: 'Nortor by faii', PRICE: 50, STARTING_BOTTLES: 50,
  BOTTLES:'Bottles', ORDERS:'Orders', ITEMS:'OrderItems', PAYMENTS:'Payments', LOG:'StockLog', SETTINGS:'Settings'
});

function doGet(e) {
  const page = HtmlService.createTemplateFromFile('Index');
  page.firstToken = (e && e.parameter && e.parameter.b) ? String(e.parameter.b) : '';
  return page.evaluate().setTitle(N.BRAND).addMetaTag('viewport','width=device-width,initial-scale=1');
}

/** ฟังก์ชัน doPost รองรับการรับคำขอผ่าน fetch API จาก GitHub Pages หรือ Web App ภายนอก */
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const args = contents.args || [];
    
    const allowedActions = {
      'publicConfig': publicConfig,
      'bottleLookup': bottleLookup,
      'checkout': checkout,
      'uploadSlip': uploadSlip,
      'loginAdmin': loginAdmin,
      'adminData': adminData,
      'adminSlipUrl': adminSlipUrl,
      'adminDecision': adminDecision,
      'adminConfirmCash': adminConfirmCash,
      'adminSavePromptPay': adminSavePromptPay,
      'adminLabels': adminLabels
    };

    if (!allowedActions[action]) {
      throw new Error('ไม่พบคำสั่ง: ' + action);
    }

    const result = allowedActions[action].apply(null, args);
    return ContentService.createTextOutput(JSON.stringify({ data: result }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** RUN ONCE, from this new Sheet (Extensions > Apps Script). Does not touch other projects. */
function setupNewStore() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw Error('โปรดสร้างโปรเจกต์ผ่าน Google Sheets ใหม่: Extensions > Apps Script');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('STORE_READY') === 'YES') throw Error('ตั้งค่าร้านนี้ไปแล้ว ไม่ต้องรันซ้ำ');
  props.setProperty('SPREADSHEET_ID',ss.getId());
  const defs = [
    [N.BOTTLES,['bottle_id','token','status','created_at','order_id','updated_at']],
    [N.ORDERS,['order_id','created_at','buyer_name','qty','unit_price','total','status','slip_id','paid_at','note','claim_key','payment_method']],
    [N.ITEMS,['order_id','bottle_id','unit_price']],
    [N.PAYMENTS,['payment_id','order_id','amount','status','slip_id','submitted_at','verified_at','payment_method']],
    [N.LOG,['logged_at','bottle_id','action','order_id','note']],
    [N.SETTINGS,['key','value']]
  ];
  defs.forEach(([name,heads])=> {
    let sh=ss.getSheetByName(name);
    if (sh && sh.getLastRow()>0) throw Error('มีข้อมูลในชีต '+name+' แล้ว โปรดสร้าง Google Sheets ใหม่เพื่อป้องกันการทับข้อมูล');
    if(!sh) sh=ss.insertSheet(name);
    sh.appendRow(heads);sh.setFrozenRows(1);
    sh.getRange(1,1,1,heads.length).setFontWeight('bold').setBackground('#eaf4fb');
  });
  const now=new Date(), bottles=[];
  for(let i=1;i<=N.STARTING_BOTTLES;i++){
    bottles.push(['NBF-'+String(i).padStart(3,'0'),Utilities.getUuid().replace(/-/g,''),'AVAILABLE',now,'',now]);
  }
  sheet_(N.BOTTLES).getRange(2,1,bottles.length,6).setValues(bottles);
  sheet_(N.SETTINGS).getRange(2,1,3,2).setValues([
    ['PRICE_BAHT',String(N.PRICE)],['PROMPTPAY_ID',''],['PROMPTPAY_NAME','']
  ]);
  props.setProperty('STORE_READY','YES');
  return 'สร้างร้านใหม่สำเร็จ 50 ขวด ขวดละ 50 บาท';
}

/** Safe upgrade for a store already created with the 50-bottle edition. Run once after replacing Code.gs. */
function enableCashPayments() {
  const ss=ss_();
  [
    [N.ORDERS,12,'payment_method'],
    [N.PAYMENTS,8,'payment_method']
  ].forEach(([tab,col,header])=>{
    const sheet=ss.getSheetByName(tab);
    if(!sheet) throw Error('ไม่พบชีต '+tab);
    const old=String(sheet.getRange(1,col).getValue()||'').trim();
    if(old && old!==header)throw Error('คอลัมน์ '+col+' ของ '+tab+' มีข้อมูลอื่นอยู่แล้ว กรุณาตรวจสอบก่อน');
    sheet.getRange(1,col).setValue(header);
    sheet.getRange(1,col).setFontWeight('bold').setBackground('#eaf4fb');
  });
  return 'เพิ่มวิธีชำระเงินสดสำเร็จ ข้อมูลเก่ายังคงอยู่และไม่สร้างขวดใหม่';
}
function publicConfig() { return {price:N.PRICE,brand:N.BRAND,promptpay:setting_('PROMPTPAY_ID'),account:setting_('PROMPTPAY_NAME')}; }
function bottleLookup(token){
  const f=lookup_(N.BOTTLES,2,safe_(token,100));
  if(!f)throw Error('QR ไม่ถูกต้องหรือไม่ใช่ของร้านนี้');
  return {id:String(f.values[0]), available:f.values[2]==='AVAILABLE', status:String(f.values[2])};
}
function checkout(payload){
  const buyer=safe_(payload&&payload.name,80);
  const method=String(payload&&payload.paymentMethod||'PROMPTPAY').toUpperCase();
  if(!['PROMPTPAY','CASH'].includes(method))throw Error('วิธีชำระเงินไม่ถูกต้อง');
  const tokens=Array.isArray(payload&&payload.tokens)?payload.tokens.map(x=>safe_(x,100)):[];
  if(!buyer)throw Error('กรุณากรอกชื่อผู้ซื้อ');
  if(!tokens.length||tokens.length>50)throw Error('เลือกรายการ 1–50 ขวด');
  if(new Set(tokens).size!==tokens.length)throw Error('มี QR ซ้ำในตะกร้า');
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const matches=tokens.map(token=>{
      const f=lookup_(N.BOTTLES,2,token);
      if(!f)throw Error('มี QR ที่ไม่ถูกต้อง');
      if(f.values[2]!=='AVAILABLE')throw Error('ขวด '+f.values[0]+' ถูกทำรายการแล้ว');
      return f;
    });
    const now=new Date(), id='NBF-'+Utilities.getUuid().slice(0,10).toUpperCase();
    const secret=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
    const qty=matches.length,total=qty*N.PRICE;
    const orderStatus=method==='CASH'?'CASH_PENDING':'PENDING';
    sheet_(N.ORDERS).appendRow([id,now,buyer,qty,N.PRICE,total,orderStatus,'', '', '',secret,method]);
    sheet_(N.ITEMS).getRange(sheet_(N.ITEMS).getLastRow()+1,1,qty,3)
      .setValues(matches.map(f=>[id,f.values[0],N.PRICE]));
    const bs=sheet_(N.BOTTLES);
    matches.forEach(f=>bs.getRange(f.row,3,1,4).setValues([['CLAIMED',f.values[3],id,now]]));
    sheet_(N.PAYMENTS).appendRow(['PAY-'+Utilities.getUuid().slice(0,8),id,total,orderStatus,'',now,'',method]);
    const logs=sheet_(N.LOG);
    logs.getRange(logs.getLastRow()+1,1,qty,5).setValues(matches.map(f=>[now,f.values[0],'SOLD_RECORDED',id,'ลูกค้ากดยืนยันหยิบ']));
    return {orderId:id,secret:secret,qty:qty,total:total,status:orderStatus,paymentMethod:method};
  }finally{lock.releaseLock();}
}
function uploadSlip(p){
  const orderId=safe_(p&&p.orderId,80),secret=safe_(p&&p.secret,100);
  const f=lookup_(N.ORDERS,1,orderId);
  if(!f||!secret||f.values[10]!==secret)throw Error('ไม่มีสิทธิ์ส่งสลิปของรายการนี้');
  if(String(f.values[11]||'PROMPTPAY')==='CASH')throw Error('รายการเงินสดไม่ต้องแนบสลิป');
  if(!['PENDING','VERIFYING'].includes(String(f.values[6])))throw Error('รายการนี้ปิดไปแล้ว');
  const mime=String(p.mime||'');let content=String(p.data||'');
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('รองรับภาพ JPG PNG WEBP');
  if(content.length>4600000)throw Error('ภาพใหญ่เกินไป โปรดใช้ไฟล์ไม่เกิน 3 MB');
  content=content.replace(/^data:[^,]+,/, '');
  const bytes=Utilities.base64Decode(content);
  const ext=mime==='image/jpeg'?'jpg':mime.split('/')[1];
  const it=DriveApp.getFoldersByName('Nortor Faii - Private Slips');
  const folder=it.hasNext()?it.next():DriveApp.createFolder('Nortor Faii - Private Slips');
  const file=folder.createFile(Utilities.newBlob(bytes,mime,orderId+'.'+ext));
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  sheet_(N.ORDERS).getRange(f.row,7).setValue('VERIFYING');
  sheet_(N.ORDERS).getRange(f.row,8).setValue(file.getId());
  const payment=lookup_(N.PAYMENTS,2,orderId);
  if(payment){sheet_(N.PAYMENTS).getRange(payment.row,4).setValue('VERIFYING');sheet_(N.PAYMENTS).getRange(payment.row,5).setValue(file.getId());sheet_(N.PAYMENTS).getRange(payment.row,6).setValue(new Date());}
  return {status:'VERIFYING'};
}
function loginAdmin(password){
  const expected=PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if(!expected)throw Error('ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน Script Properties');
  if(expected!==String(password))throw Error('รหัสผ่านไม่ถูกต้อง');
  const token=Utilities.getUuid()+Utilities.getUuid();
  CacheService.getScriptCache().put('ADMIN_'+token,'yes',18000);
  return {token:token};
}
function requireAdmin_(token){if(!token||CacheService.getScriptCache().get('ADMIN_'+token)!=='yes')throw Error('กรุณาเข้าสู่ระบบ Admin ใหม่');}
function adminData(token){
  requireAdmin_(token);
  const orders=table_(N.ORDERS),bottles=table_(N.BOTTLES),today=new Date();today.setHours(0,0,0,0);
  return {
    available:bottles.filter(r=>r[2]==='AVAILABLE').length,
    claimed:bottles.filter(r=>r[2]==='CLAIMED').length,
    paidToday:orders.filter(r=>r[6]==='PAID'&&r[8]&&new Date(r[8])>=today).reduce((s,r)=>s+Number(r[5]),0),
    pending:orders.filter(r=>r[6]==='PENDING'||r[6]==='CASH_PENDING').length,
    verifying:orders.filter(r=>r[6]==='VERIFYING').length,
    cashPending:orders.filter(r=>r[6]==='CASH_PENDING').length,
    orders:orders.slice().reverse().map(r=>({id:r[0],at:fmt_(r[1]),buyer:r[2],
