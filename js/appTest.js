import { supabase } from './supabaseClient.js';

// ค่า UUID สำรองสำหรับ Test Mode (หากยังไม่มีข้อมูลใน profiles)
const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000001';
let CURRENT_USER_ID = '';

// -------------------------------------------------------------
// 1. เริ่มต้นระบบ ดึง ID User มาใช้ในการทดสอบ
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 2. ดึงข้อมูลสต๊อกมาแสดงบน Dashboard แบบ Real-time
// -------------------------------------------------------------
async function loadStockData() {
    // 📦 ดึงสต๊อกคลังใหญ่
    const { data: central } = await supabase
        .from('central_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .maybeSingle();

    const centralElem = document.getElementById('centralQtyDisplay');
    if (centralElem) {
        centralElem.innerText = central ? central.current_qty : 0;
    }

    // 🩺 ดึงสต๊อกคลังย่อย (ดึงยอดล่าสุดที่มีในระบบเพื่อรองรับ Test Mode)
    const { data: sub } = await supabase
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
// 🔄 3. ระบบสลับ Role (ซ่อน/แสดง Panel และปุ่ม Export ตาม Role)
// -------------------------------------------------------------
const roleSelector = document.getElementById('roleSelector');
const centralPanel = document.getElementById('centralPanel');
const subPanel = document.getElementById('subPanel');
const exportSection = document.getElementById('btnExportExcel')?.closest('div.bg-white');

if (roleSelector) {
    roleSelector.addEventListener('change', (e) => {
        const selectedRole = e.target.value;

        if (selectedRole === 'CENTRAL_ADMIN') {
            centralPanel?.classList.remove('hidden');
            subPanel?.classList.add('hidden');
            exportSection?.classList.remove('hidden'); // Admin เห็นปุ่ม Export
        } else if (selectedRole === 'SUB_STAFF') {
            centralPanel?.classList.add('hidden');
            subPanel?.classList.remove('hidden');
            exportSection?.classList.add('hidden');    // ❌ Staff ทั่วไป ซ่อนปุ่ม Export
        } else if (selectedRole === 'SUPER_ADMIN') {
            centralPanel?.classList.remove('hidden');
            subPanel?.classList.remove('hidden');
            exportSection?.classList.remove('hidden'); // Super Admin เห็นปุ่ม Export
        }
    });
}

// -------------------------------------------------------------
// 📦 4. ฝั่งคลังใหญ่ (Central Stock Functions)
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
// 🩺 5. ฝั่งคลังย่อย (Sub Stock Functions)
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
// 📊 6. ปุ่ม Export รายงานภาพรวมระบบเป็น Excel แยก Tabs (.xlsx) สำหรับ Executive Report
// -------------------------------------------------------------
document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
    const currentRole = document.getElementById('roleSelector')?.value;

    if (currentRole === 'SUB_STAFF') {
        return alert('🚫 คุณไม่มีสิทธิ์เข้าถึงรายงานสรุประบบ (เฉพาะ Admin / Super Admin เท่านั้น)');
    }

    try {
        // 1. ดึงข้อมูลประวัติ Transaction ทั้งหมด
        const { data: transactions, error: transError } = await supabase
            .from('stock_transactions')
            .select(`
                created_at,
                type,
                quantity,
                note,
                from_user:from_user_id (full_name, staff_code),
                to_user:to_user_id (full_name, staff_code)
            `)
            .order('created_at', { ascending: false });

        if (transError) throw transError;

        // 2. ดึงข้อมูลการแจกของ (Distribution Logs)
        const { data: distributions, error: distError } = await supabase
            .from('distribution_logs')
            .select(`
                created_at,
                recipient_info,
                quantity,
                distributor:distributor_id (full_name, staff_code)
            `)
            .order('created_at', { ascending: false });

        if (distError) throw distError;

        // --- สร้าง Workbook ของ SheetJS ---
        const workbook = XLSX.utils.book_new();

        // 🟢 TAB 1: รายการเติมเข้าคลังใหญ่ (RESTOCK)
        const restockData = (transactions || [])
            .filter(t => t.type === 'RESTOCK')
            .map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'ประเภท': 'เติมเข้าคลังใหญ่',
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ / เลขที่อ้างอิง': t.note || '-'
            }));
        const sheetRestock = XLSX.utils.json_to_sheet(restockData.length ? restockData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
        XLSX.utils.book_append_sheet(workbook, sheetRestock, "1. เติมเข้าคลังใหญ่");

        // 🔵 TAB 2: รายการจ่ายให้คลังย่อย (ISSUE & RETURN)
        const transferData = (transactions || [])
            .filter(t => t.type === 'ISSUE' || t.type === 'RETURN')
            .map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'การดำเนินการ': t.type === 'ISSUE' ? 'จ่ายให้คลังย่อย' : 'ส่งคืนคลังใหญ่',
                'ผู้รับ/ผู้ส่งคืน (Staff)': t.to_user?.full_name ? `${t.to_user.full_name} (${t.to_user.staff_code || '-'})` : (t.from_user?.full_name || 'ผู้ใช้งานระบบ'),
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ': t.note || '-'
            }));
        const sheetTransfer = XLSX.utils.json_to_sheet(transferData.length ? transferData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
        XLSX.utils.book_append_sheet(workbook, sheetTransfer, "2. จ่าย-คืน คลังย่อย");

        // 🟡 TAB 3: รายการแจกของใช้งานจริง (DISTRIBUTE)
        const distributeData = (distributions || []).map(d => ({
            'วันที่-เวลา': new Date(d.created_at).toLocaleString('th-TH'),
            'ผู้แจก (Staff)': d.distributor?.full_name ? `${d.distributor.full_name} (${d.distributor.staff_code || '-'})` : 'ผู้ใช้งานระบบ',
            'ผู้รับ / HN / จุดงาน': d.recipient_info || '-',
            'จำนวนที่แจก (Set)': d.quantity
        }));
        const sheetDistribute = XLSX.utils.json_to_sheet(distributeData.length ? distributeData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
        XLSX.utils.book_append_sheet(workbook, sheetDistribute, "3. ประวัติการแจกใช้งาน");

        // --- ดาวน์โหลดไฟล์ Excel ---
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `D-Stock_ER_Executive_Report_${dateStr}.xlsx`);

    } catch (err) {
        console.error('Export Error:', err);
        alert('เกิดข้อผิดพลาดในการดึงรายงาน: ' + err.message);
    }
});

// -------------------------------------------------------------
// เริ่มต้นเรียกทำงานทันทีเมื่อโหลดสคริปต์
// -------------------------------------------------------------
initUser();
