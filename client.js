// 1. ระบุ Web App URL ของ Google Apps Script
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxU2DaXHWLU_WCqDHhEGit-GSZP3XePDbZtiEuNTTBpxFj6dxmB6x8M30hJ6nCRV693/exec";

const $=id=>document.getElementById(id);
const STORAGE_CART='nortor_fresh_cart_2026';
const STORAGE_PENDING='nortor_fresh_pending_2026';
let cart=[],config=null,adminToken=null,pendingOrder=null;

// 2. ฟังก์ชัน call สำหรับเชื่อมต่อกับ Google Apps Script
async function call(name, ...args) {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: name, args: args })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result.data;
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function notify(msg){const e=$('toast');e.textContent=msg;e.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>e.classList.remove('show'),3500)}
function html(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function readJson(k,fallback){try{return JSON.parse(localStorage.getItem(k))||fallback}catch(e){return fallback}}
function screen(id){['shop','adminLogin','admin'].forEach(x=>$(x).classList.add('hidden'));$(id).classList.remove('hidden')}

async function boot(){
  try{config=await call('publicConfig');$('payId').textContent=config.promptpay?(config.promptpay+' · '+config.account):'ยังไม่ได้ตั้งเลขพร้อมเพย์';}catch(e){notify(e.message)}
  cart=readJson(STORAGE_CART,[]);
  pendingOrder=readJson(STORAGE_PENDING,null);
  
  const urlParams = new URLSearchParams(window.location.search);
  const FIRST_TOKEN = urlParams.get('b');

  if(FIRST_TOKEN){
    try{
      const bottle=await call('bottleLookup',FIRST_TOKEN);
      if(!bottle.available)notify('ขวด '+bottle.id+' เคยถูกบันทึกแล้ว');
      else if(cart.some(x=>x.token===FIRST_TOKEN))notify('ขวดนี้อยู่ในตะกร้าแล้ว');
      else{cart.push({token:FIRST_TOKEN,id:bottle.id});localStorage.setItem(STORAGE_CART,JSON.stringify(cart));notify('เพิ่มขวด '+bottle.id+' ลงตะกร้า');}
    }catch(e){notify(e.message)}
    
    try{const u=new URL(location.href);u.searchParams.delete('b');history.replaceState({},'',u.toString())}catch(e){}
  }
  refreshBasket(true);
  if(pendingOrder){showPending()}
}

// ฟังก์ชันอัปเดตตะกร้าฉบับแก้ไข (ตรวจสอบกับฐานข้อมูลจริงและขึ้นแจ้งเตือน)
async function refreshBasket(silent = false) {
  cart = readJson(STORAGE_CART, []);

  if (!silent && cart.length > 0) {
    try {
      notify('กำลังตรวจสอบสถานะขวดในตะกร้า...');
      const validCart = [];
      for (const item of cart) {
        const b = await call('bottleLookup', item.token);
        if (b && b.available) {
          validCart.push(item);
        }
      }
      if (validCart.length !== cart.length) {
        cart = validCart;
        localStorage.setItem(STORAGE_CART, JSON.stringify(cart));
        notify('อัปเดตตะกร้าแล้ว (ตัดขวดที่ถูกซื้อไปแล้วออก)');
      } else {
        notify('อัปเดตตะกร้าแล้ว ขวดทั้งหมดพร้อมชำระ');
      }
    } catch (e) {
      notify(e.message);
    }
  } else if (!silent && cart.length === 0) {
    notify('ยังไม่มีขวดในตะกร้า');
  }

  $('count').textContent = cart.length + ' ขวด';
  $('total').textContent = '฿' + (cart.length * 50);
  $('buyBtn').disabled = !cart.length;
  $('basket').innerHTML = cart.length
    ? cart.map(x => '<div class="cartrow"><b>' + html(x.id) + '</b><button type="button" onclick="removeBottle(\'' + html(x.token) + '\')">ลบ</button></div>').join('')
    : '<p class="muted">ยังไม่มีขวดในตะกร้า กรุณาสแกน QR บนขวด</p>';
}

function removeBottle(token){cart=readJson(STORAGE_CART,[]).filter(x=>x.token!==token);localStorage.setItem(STORAGE_CART,JSON.stringify(cart));refreshBasket(true)}
async function placeOrder(e){e.preventDefault();cart=readJson(STORAGE_CART,[]);if(!cart.length)return notify('กรุณาสแกนขวดก่อน');const btn=$('buyBtn');btn.disabled=true;try{
  const method=document.querySelector('input[name=paymentMethod]:checked').value;
  const result=await call('checkout',{name:$('buyer').value.trim(),tokens:cart.map(x=>x.token),paymentMethod:method});
  pendingOrder=result;localStorage.setItem(STORAGE_PENDING,JSON.stringify(result));localStorage.removeItem(STORAGE_CART);cart=[];refreshBasket(true);showPending();notify('บันทึกรายการเรียบร้อย');
}catch(err){notify(err.message)}finally{btn.disabled=false}}
function showPending(){if(!pendingOrder)return;$('buyerForm').classList.add('hidden');$('payment').classList.remove('hidden');$('orderDesc').textContent=pendingOrder.orderId+' · '+pendingOrder.qty+' ขวด';$('due').textContent='฿'+pendingOrder.total;const cash=pendingOrder.paymentMethod==='CASH';$('transferBox').classList.toggle('hidden',cash);$('slipBox').classList.toggle('hidden',cash);$('cashBox').classList.toggle('hidden',!cash);$('status').textContent=cash?'รอเจ้าของร้านยืนยันรับเงินสด':'รอชำระเงิน';}
function startOver(){pendingOrder=null;localStorage.removeItem(STORAGE_PENDING);$('buyerForm').classList.remove('hidden');$('payment').classList.add('hidden');$('buyer').value='';$('confirmed').checked=false;$('slip').value='';$('uploadBtn').disabled=false;refreshBasket(true)}
function copyPay(){if(!config||!config.promptpay)return notify('เจ้าของร้านยังไม่ตั้ง PromptPay');navigator.clipboard.writeText(config.promptpay).then(()=>notify('คัดลอกเลขพร้อมเพย์แล้ว')).catch(()=>notify('คัดลอกไม่ได้ กรุณาคัดลอกด้วยตนเอง'))}
async function sendSlip(){if(!pendingOrder)return notify('ไม่พบรายการ');const f=$('slip').files[0];if(!f)return notify('กรุณาเลือกสลิป');if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>3000000)return notify('ใช้ภาพ JPG PNG WEBP ขนาดไม่เกิน 3 MB');$('uploadBtn').disabled=true;try{const data=await new Promise((ok,no)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=no;reader.readAsDataURL(f)});await call('uploadSlip',{orderId:pendingOrder.orderId,secret:pendingOrder.secret,mime:f.type,data});$('status').textContent='ส่งสลิปแล้ว — รอเจ้าของร้านตรวจสอบ';notify('ส่งสลิปสำเร็จ')}catch(e){$('uploadBtn').disabled=false;notify(e.message)}}
function viewShop(){screen('shop')}function viewAdminLogin(){screen('adminLogin')}
async function login(e){e.preventDefault();try{const r=await call('loginAdmin',$('adminPass').value);adminToken=r.token;$('adminPass').value='';screen('admin');await refreshAdmin()}catch(e){notify(e.message)}}
function logout(){adminToken=null;screen('shop')}
async function refreshAdmin(){try{
 const d=await call('adminData',adminToken);
 $('available').textContent=d.available;$('claimed').textContent=d.claimed;$('pending').textContent=d.pending;$('verifying').textContent=d.verifying;$('cashPending').textContent=d.cashPending;$('sales').textContent='฿'+d.paidToday;
 $('orders').innerHTML=d.orders.length?d.orders.map(o=>{
   const actions=o.status==='CASH_PENDING'?'<button onclick="confirmCash(\''+o.id+'\')">ยืนยันได้รับเงินสด</button>':o.status==='VERIFYING'?'<button onclick="openSlip(\''+o.id+'\')">ดูสลิป</button><button onclick="decide(\''+o.id+'\',\'APPROVE\')">อนุมัติ</button><button onclick="decide(\''+o.id+'\',\'REJECT\')">ปฏิเสธ</button>':'';
   return '<div class="order"><div class="order-top"><b>'+html(o.buyer)+'</b><span class="badge '+html(o.status)+'">'+html(o.status)+'</span></div><small>'+html(o.id)+' · '+html(o.at)+'<br>'+o.qty+' ขวด × ฿'+o.price+' = ฿'+o.total+' · '+(o.method==='CASH'?'เงินสด':'พร้อมเพย์')+'</small><div class="actions">'+actions+'</div></div>';
 }).join(''):'<p class="muted">ยังไม่มีรายการ</p>';
}catch(e){notify(e.message)}}
async function confirmCash(id){if(!confirm('คุณได้รับเงินสดครบตามยอดจริงแล้วใช่หรือไม่?'))return;try{const r=await call('adminConfirmCash',adminToken,id);notify(r.message);await refreshAdmin()}catch(e){notify(e.message)}}
async function openSlip(id){try{const url=await call('adminSlipUrl',adminToken,id);window.open(url,'_blank')}catch(e){notify(e.message)}}
async function decide(id,decision){if(decision==='APPROVE'&&!confirm('ตรวจสอบยอดเงินเข้าจริงจากธนาคารแล้วใช่หรือไม่?'))return;let note=decision==='REJECT'?(prompt('เหตุผลที่ปฏิเสธสลิป','ยอดเงินไม่ตรง')||'สลิปไม่ผ่าน') : 'ตรวจยอดเงินแล้ว';try{await call('adminDecision',adminToken,id,decision,note);await refreshAdmin();notify('อัปเดตสถานะแล้ว')}catch(e){notify(e.message)}}
function toggle(id){$(id).classList.toggle('hidden')}
async function savePay(){try{await call('adminSavePromptPay',adminToken,$('promptpay').value.trim(),$('account').value.trim());config=await call('publicConfig');$('payId').textContent=config.promptpay+' · '+config.account;notify('บันทึก PromptPay แล้ว')}catch(e){notify(e.message)}}
async function makeLabels(){try{
  const labels=await call('adminLabels',adminToken);
  $('labels').classList.remove('hidden');
  $('labelsGrid').innerHTML=labels.map(x=>{
    const qr='https://api.qrserver.com/v1/create-qr-code/?size=210x210&data='+encodeURIComponent(x.url);
    return '<div class="sticker"><img loading="lazy" src="'+html(qr)+'" alt="QR '+html(x.id)+'"><strong>'+html(x.id)+'</strong><a href="'+html(x.url)+'" target="_blank" rel="noopener">เปิดลิงก์ทดสอบ</a></div>';
  }).join('');
  $('labels').scrollIntoView({behavior:'smooth'});notify('สร้างรายการ QR '+labels.length+' ดวง');
}catch(e){notify(e.message)}}

boot();
