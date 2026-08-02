import { supabase } from './supabaseClient.js';

// ดึง User ID ของ Super Admin ที่เราสร้างไว้ใน Database มาใช้จำลองตัวละครทดสอบ
let CURRENT_USER_ID = '';

async function initUser() {
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
    if (profiles && profiles.length > 0) {
        CURRENT_USER_ID = profiles[0].id;
        loadStockData();
    }
}

// 1. ดึงข้อมูลสต๊อก Real-time มาแสดง
async function loadStockData() {
    // ดึงสต๊อกคลังใหญ่
    const { data: central } = await supabase.from('central_stock').select('current_qty').eq('item_id', 1).single();
    if (central) {
        document.getElementById('centralQtyDisplay').innerText = central.current_qty;
    }

    // ดึงสต๊อกคลังย่อย
    const { data: sub } = await supabase.from('sub_stock').select('current_qty').eq('item_id', 1).single();
    if (sub && sub.length > 0) {
        document.getElementById('subQtyDisplay').innerText = sub[0].current_qty;
    } else {
        document.getElementById('subQtyDisplay').innerText = 0;
    }
}

// 2. ปุ่มจ่ายของจากคลังใหญ่ -> คลังย่อย (Issue)
document.getElementById('btnIssue').addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('issueQty').value);
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ถูกต้อง');

    const { error } = await supabase.rpc('issue_stock_to_sub', {
        p_item_id: 1,
        p_to_user_id: CURRENT_USER_ID,
        p_quantity: qty,
        p_note: 'จ่ายของทดสอบ'
    });

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert('จ่ายของสำเร็จ!');
        document.getElementById('issueQty').value = '';
        loadStockData();
    }
});

// 3. ปุ่มลงบันทึกการแจกของ (Distribute)
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

// 4. ปุ่มแจ้งคืนของเข้าคลัง (Return)
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

// 5. ปุ่ม Export รายงานภาษาไทยเป็น Excel (.xlsx)
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

// เริ่มทำงานเมื่อเปิดหน้า
initUser();
