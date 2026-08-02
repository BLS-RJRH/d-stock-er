import { supabase } from './supabaseClient.js';

// ค่า UUID สำรองสำหรับ Test Mode (หากยังไม่มีข้อมูลใน profiles)
const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000001';
let CURRENT_USER_ID = '';

// 1. เริ่มต้นระบบ ดึง ID User มาใช้ในการทดสอบ
async function initUser() {
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) throw error;

        if (profiles && profiles.length > 0) {
            CURRENT_USER_ID = profiles[0].id;
        } else {
            CURRENT_USER_ID = FALLBACK_USER_ID;
        }
    } catch (err) {
        console.warn('⚠️ ไม่สามารถดึง Profile ได้ ใช้ Fallback ID สำหรับทดสอบแทน:', err.message);
        CURRENT_USER_ID = FALLBACK_USER_ID;
    } finally {
        await loadStockData();
    }
}

// 2. ดึงข้อมูลสต๊อกมาแสดงบน Dashboard
async function loadStockData() {
    // 📦 ดึงสต๊อกคลังใหญ่
    const { data: central, error: centralError } = await supabase
        .from('central_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .maybeSingle();

    const centralElem = document.getElementById('centralQtyDisplay');
    if (centralElem) {
        centralElem.innerText = central ? central.current_qty : 0;
    }

    // 🩺 ดึงสต๊อกคลังย่อย (ดึงยอดล่าสุดที่มีในระบบเพื่อรองรับ Test Mode)
    const { data: sub, error: subError } = await supabase
        .from('sub_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const subElem = document.getElementById('subQtyDisplay');
    if (subElem) {
        subElem.innerText = sub ? sub.current_qty : 0;
    }
}

// -------------------------------------------------------------
// 🔄 ระบบสลับ Role (ซ่อน/แสดงหน้าต่างตาม Role)
// -------------------------------------------------------------
const roleSelector = document.getElementById('roleSelector');
const centralPanel = document.getElementById('centralPanel');
const subPanel = document.getElementById('subPanel');

if (roleSelector) {
    roleSelector.addEventListener('change', (e) => {
        const selectedRole = e.target.value;

        if (selectedRole === 'CENTRAL_ADMIN') {
            centralPanel?.classList.remove('hidden');
            subPanel?.classList.add('hidden');
        } else if (selectedRole === 'SUB_STAFF') {
            centralPanel?.classList.add('hidden');
            subPanel?.classList.remove('hidden');
        } else if (selectedRole === 'SUPER_ADMIN') {
            centralPanel?.classList.remove('hidden');
            subPanel?.classList.remove('hidden');
        }
    });
}

// -------------------------------------------------------------
// 📦 ฝั่งคลังใหญ่ (Central Stock Functions)
// -------------------------------------------------------------

// ➕ ปุ่มเติมของเข้าคลังใหญ่ (Restock)
document.getElementById('btnRestock')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('restockQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการเติม');

    const { error } = await supabase.rpc('restock_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'เติมของเข้าคลังใหญ่ (Test Mode)'
    });

    if (error) {
        console.error('Restock Error:', error);
        alert('เกิดข้อผิดพลาดในการเติมของ: ' + error.message);
    } else {
        alert(`เติมของเข้าคลังใหญ่สำเร็จ +${qty} Set!`);
        qtyInput.value = '';
        await loadStockData();
    }
});

// ➡️ ปุ่มจ่ายของออกให้คลังย่อย (Issue)
document.getElementById('btnIssue')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('issueQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการจ่าย');

    const targetUserId = CURRENT_USER_ID || FALLBACK_USER_ID;

    const { error } = await supabase.rpc('issue_stock_to_sub', {
        p_item_id: 1,
        p_to_user_id: targetUserId,
        p_quantity: qty,
        p_note: 'จ่ายของให้สต๊อกย่อย'
    });

    if (error) {
        console.error('Issue Error:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert(`จ่ายของออกสำเร็จ -${qty} Set!`);
        qtyInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 🩺 ฝั่งคลังย่อย (Sub Stock Functions)
// -------------------------------------------------------------

// 📝 ปุ่มลงบันทึกการแจกของ (Distribute)
document.getElementById('btnDistribute')?.addEventListener('click', async () => {
    const recipientInput = document.getElementById('recipientInfo');
    const qtyInput = document.getElementById('distributeQty');
    const recipient = recipientInput.value.trim();
    const qty = parseInt(qtyInput.value);

    if (!recipient) return alert('กรุณากรอกผู้รับ / เลข HN / จุดงาน');
    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการแจก');

    const { error } = await supabase.rpc('distribute_item', {
        p_item_id: 1,
        p_recipient_info: recipient,
        p_quantity: qty
    });

    if (error) {
        console.error('Distribute Error:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert('บันทึกการแจกของสำเร็จ!');
        recipientInput.value = '';
        qtyInput.value = '';
        await loadStockData();
    }
});

// ↩️ ปุ่มส่งคืนคลังใหญ่ (Return)
document.getElementById('btnReturn')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('returnQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการส่งคืน');

    const { error } = await supabase.rpc('return_stock_to_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'ส่งคืนคลังใหญ่ (Test Mode)'
    });

    if (error) {
        console.error('Return Error:', error);
        alert('เกิดข้อผิดพลาดในการส่งคืน: ' + error.message);
    } else {
        alert(`ส่งคืนคลังใหญ่สำเร็จ ${qty} Set!`);
        qtyInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 📊 ปุ่ม Export รายงานเป็น Excel (.xlsx)
// -------------------------------------------------------------
document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
    const { data, error } = await supabase
        .from('distribution_logs')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return alert('เกิดข้อผิดพลาดในการดึงข้อมูล: ' + error.message);

    if (!data || data.length === 0) {
        return alert('ยังไม่มีข้อมูลการแจกของในระบบ');
    }

    const formattedData = data.map(row => ({
        'วันที่-เวลา': new Date(row.created_at).toLocaleString('th-TH'),
        'ผู้รับ / HN / จุดงาน': row.recipient_info || '-',
        'จำนวนที่แจก (Set)': row.quantity
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "รายงานการแจกของ ER");
    XLSX.writeFile(workbook, `D-Stock_ER_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
});

// เริ่มต้นเรียกทำงานทันทีเมื่อโหลดสคริปต์
initUser();
