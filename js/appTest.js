import { supabase } from './supabaseClient.js';

let CURRENT_USER_ID = '';

// 1. เริ่มต้นระบบ ดึง ID User มาทดสอบ
async function initUser() {
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    if (profiles && profiles.length > 0) {
        CURRENT_USER_ID = profiles[0].id;
        loadStockData();
    }
}

// 2. ดึงข้อมูลสต๊อก Real-time
async function loadStockData() {
    // ดึงสต๊อกคลังใหญ่
    const { data: central } = await supabase.from('central_stock').select('current_qty').eq('item_id', 1).single();
    if (central) {
        document.getElementById('centralQtyDisplay').innerText = central.current_qty;
    }

    // ดึงสต๊อกคลังย่อย
    const { data: sub } = await supabase.from('sub_stock').select('current_qty').eq('item_id', 1).single();
    if (sub) {
        document.getElementById('subQtyDisplay').innerText = sub.current_qty;
    } else {
        document.getElementById('subQtyDisplay').innerText = 0;
    }
}

// -------------------------------------------------------------
// 🔄 ระบบสลับ Role (ซ่อน/แสดงหน้าต่างตาม Role)
// -------------------------------------------------------------
const roleSelector = document.getElementById('roleSelector');
const centralPanel = document.getElementById('centralPanel');
const subPanel = document.getElementById('subPanel');

roleSelector.addEventListener('change', (e) => {
    const selectedRole = e.target.value;

    if (selectedRole === 'CENTRAL_ADMIN') {
        // แสดงเฉพาะคลังใหญ่
        centralPanel.classList.remove('hidden');
        subPanel.classList.add('hidden');
    } else if (selectedRole === 'SUB_STAFF') {
        // แสดงเฉพาะคลังย่อย
        centralPanel.classList.add('hidden');
        subPanel.classList.remove('hidden');
    } else if (selectedRole === 'SUPER_ADMIN') {
        // แสดงทั้งหมด
        centralPanel.classList.remove('hidden');
        subPanel.classList.remove('hidden');
    }
});

// -------------------------------------------------------------
// 📦 ฝั่งคลังใหญ่ (Central Stock Functions)
// -------------------------------------------------------------

// ➕ ปุ่มเติมของเข้าคลังใหญ่ (Restock)
document.getElementById('btnRestock').addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('restockQty').value);
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการเติม');

    // ดึงยอดปัจจุบันในคลังใหญ่ก่อน
    const { data: central } = await supabase.from('central_stock').select('current_qty').eq('item_id', 1).single();
    const newQty = (central ? central.current_qty : 0) + qty;

    // อัปเดตยอดใหม่เข้าคลังใหญ่
    const { error } = await supabase.from('central_stock').update({ 
        current_qty: newQty,
        updated_at: new Date()
    }).eq('item_id', 1);

    if (error) {
        alert('เกิดข้อผิดพลาดในการเติมของ: ' + error.message);
    } else {
        // บันทึก Audit Log
        await supabase.from('audit_logs').insert([{
            user_id: CURRENT_USER_ID,
            action: 'RESTOCK_CENTRAL',
            details: { added_qty: qty, total_qty: newQty }
        }]);

        alert(`เติมของเข้าคลังใหญ่สำเร็จ +${qty} Set!`);
        document.getElementById('restockQty').value = '';
        loadStockData();
    }
});

// ➡️ ปุ่มจ่ายของออกให้คลังย่อย (Issue)
document.getElementById('btnIssue').addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('issueQty').value);
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการจ่าย');

    const { error } = await supabase.rpc('issue_stock_to_sub', {
        p_item_id: 1,
        p_to_user_id: CURRENT_USER_ID,
        p_quantity: qty,
        p_note: 'จ่ายของทดสอบ'
    });

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert('จ่ายของออกสำเร็จ!');
        document.getElementById('issueQty').value = '';
        loadStockData();
    }
});

// -------------------------------------------------------------
// 🩺 ฝั่งคลังย่อย (Sub Stock Functions)
// -------------------------------------------------------------

// 📝 ปุ่มลงบันทึกการแจกของ (Distribute)
document.getElementById('btnDistribute').addEventListener('click', async () => {
    const recipient = document.getElementById('recipientInfo').value;
    const qty = parseInt(document.getElementById('distributeQty').value);

    if (!recipient) return alert('กรุณากรอกผู้รับ/HN');
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวน');

    const { error } = await supabase.rpc('distribute_item', {
        p_item_id: 1,
        p_recipient_info: recipient,
        p_quantity: qty
    });

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert('บันทึกการแจกของสำเร็จ!');
        document.getElementById('recipientInfo').value = '';
        document.getElementById('distributeQty').value = '';
        loadStockData();
    }
});

// ↩️ ปุ่มส่งคืนคลังใหญ่ (Return)
document.getElementById('btnReturn').addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('returnQty').value);
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการคืน');

    const { error } = await supabase.rpc('return_stock_to_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'ส่งคืนทดสอบ'
    });

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert('คืนของเข้าคลังสำเร็จ!');
        document.getElementById('returnQty').value = '';
        loadStockData();
    }
});

// 📊 ปุ่ม Export รายงานเป็น Excel (.xlsx) ภาษาไทย
document.getElementById('btnExportExcel').addEventListener('click', async () => {
    const { data, error } = await supabase.from('distribution_logs').select('*');
    if (error) return alert('เกิดข้อผิดพลาดในการดึงข้อมูล');

    const formattedData = data.map(row => ({
        'วันที่-เวลา': new Date(row.created_at).toLocaleString('th-TH'),
        'ผู้รับ/HN/จุดงาน': row.recipient_info,
        'จำนวนที่แจก': row.quantity
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "รายงานแจกของ ER");
    XLSX.writeFile(workbook, `D-Stock_ER_Report.xlsx`);
});

// เรียกทำงานเมื่อโหลดหน้าเว็บ
initUser();
