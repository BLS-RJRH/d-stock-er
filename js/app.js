import { supabase } from './supabaseClient.js';

// ตัวแปรเก็บข้อมูล User ที่ล็อกอินปัจจุบัน
let CURRENT_USER = null;

// 🚨 เกณฑ์เตือนสต๊อกต่ำ (Low Stock Thresholds)
const MIN_CENTRAL_STOCK = 30;
const MIN_SUB_STOCK = 10;

// -------------------------------------------------------------
// 🔒 1. ตรวจสอบ Session การเข้าสู่ระบบ และดึง Profile จริง
// -------------------------------------------------------------
async function initProductionUser() {
    try {
        // 1.1 ตรวจสอบว่ามี Session การล็อกอินอยู่หรือไม่
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr || !session) {
            alert('กรุณาเข้าสู่ระบบก่อนใช้งาน');
            window.location.href = './index.html';
            return;
        }

        // 1.2 ดึงข้อมูล Profile ของคนๆ นั้นจากตาราง profiles
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profileErr || !profile) {
            alert('ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน กรุณาติดต่อ Admin');
            await supabase.auth.signOut();
            window.location.href = './index.html';
            return;
        }

        CURRENT_USER = profile;

        // 1.3 แสดงชื่อผู้ใช้งานและ Role บน Header หน้าจอ
        const nameElem = document.getElementById('userFullName');
        const badgeElem = document.getElementById('userRoleBadge');
        
        if (nameElem) nameElem.innerText = profile.full_name || session.user.email;
        if (badgeElem) {
            badgeElem.innerText = profile.role === 'SUPER_ADMIN' ? '👑 Super Admin' : 
                                 profile.role === 'CENTRAL_ADMIN' ? '📦 Central Admin' : '🩺 Sub Staff';
        }

        // 1.4 ปรับปรุงการแสดงผล UI ตาม Role จริงของผู้ใช้งาน
        setupUIByRole(profile.role);

        // 1.5 โหลดข้อมูลสต๊อก Real-time
        await loadStockData();

    } catch (err) {
        console.error('Init Production Error:', err);
        alert('เกิดข้อผิดพลาดในการเริ่มต้นระบบ: ' + err.message);
    }
}

// -------------------------------------------------------------
// 🎨 2. ควบคุมการแสดงผล UI บน Dashboard ตาม Role จริง
// -------------------------------------------------------------
function setupUIByRole(role) {
    const centralPanel = document.getElementById('centralPanel');
    const subPanel = document.getElementById('subPanel');
    const exportSection = document.getElementById('btnExportExcel')?.closest('div.bg-white');
    const btnManageStaff = document.getElementById('btnManageStaff');

    if (role === 'SUPER_ADMIN') {
        centralPanel?.classList.remove('hidden');
        subPanel?.classList.remove('hidden');
        exportSection?.classList.remove('hidden');  // ✅ Super Admin เห็นปุ่ม Export
        btnManageStaff?.classList.remove('hidden'); // ✅ Super Admin เห็นปุ่ม จัดการ Staff
    } else if (role === 'CENTRAL_ADMIN') {
        centralPanel?.classList.remove('hidden');
        subPanel?.classList.add('hidden');
        exportSection?.classList.add('hidden');     // ❌ Central Admin ซ่อนปุ่ม Export
        btnManageStaff?.classList.add('hidden');    // ❌ Central Admin ซ่อนปุ่ม จัดการ Staff
    } else {
        // SUB_STAFF
        centralPanel?.classList.add('hidden');
        subPanel?.classList.remove('hidden');
        exportSection?.classList.add('hidden');     // ❌ Sub Staff ซ่อนปุ่ม Export
        btnManageStaff?.classList.add('hidden');    // ❌ Sub Staff ซ่อนปุ่ม จัดการ Staff
    }
}

// -------------------------------------------------------------
// 📦 3. ดึงข้อมูลสต๊อก Real-time + Low Stock Visual Alert
// -------------------------------------------------------------
async function loadStockData() {
    // 3.1 ดึงและตรวจเช็กสต๊อกคลังใหญ่
    const { data: central } = await supabase
        .from('central_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .maybeSingle();

    const centralQty = central ? central.current_qty : 0;
    const centralElem = document.getElementById('centralQtyDisplay');
    const centralCard = centralElem?.closest('.bg-red-50') || centralElem?.parentElement?.parentElement;

    if (centralElem) centralElem.innerText = centralQty;

    // เตือนเมื่อคลังใหญ่ต่ำกว่าเกณฑ์ (< 20 Set)
    if (centralCard) {
        if (centralQty <= MIN_CENTRAL_STOCK) {
            centralCard.className = "bg-red-100 border-2 border-red-500 p-4 rounded-xl animate-pulse";
            if (centralElem) centralElem.innerHTML = `${centralQty} <span class="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full ml-2">⚠️ สต๊อกต่ำวิกฤต</span>`;
        } else {
            centralCard.className = "bg-red-50 border border-red-100 p-4 rounded-xl";
        }
    }

    // 3.2 ดึงและตรวจเช็กสต๊อกคลังย่อย
    const { data: sub } = await supabase
        .from('sub_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const subQty = sub ? sub.current_qty : 0;
    const subElem = document.getElementById('subQtyDisplay');
    const subCard = subElem?.closest('.bg-blue-50') || subElem?.parentElement?.parentElement;

    if (subElem) subElem.innerText = subQty;

    // เตือนเมื่อคลังย่อยต่ำกว่าเกณฑ์ (< 5 Set)
    if (subCard) {
        if (subQty <= MIN_SUB_STOCK) {
            subCard.className = "bg-amber-100 border-2 border-amber-500 p-4 rounded-xl animate-pulse";
            if (subElem) subElem.innerHTML = `${subQty} <span class="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full ml-2">⚠️ สต๊อกย่อยใกล้หมด</span>`;
        } else {
            subCard.className = "bg-blue-50 border border-blue-100 p-4 rounded-xl";
        }
    }
}

// -------------------------------------------------------------
// 🏢 4. ฟังก์ชันฝั่งคลังใหญ่ (Central Stock Functions)
// -------------------------------------------------------------

// ➕ เติมของเข้าคลังใหญ่ (Restock)
document.getElementById('btnRestock')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('restockQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการเติม');

    const { error } = await supabase.rpc('restock_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'เติมของเข้าคลังใหญ่'
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

// ➡️ จ่ายของออกให้คลังย่อย (Issue)
document.getElementById('btnIssue')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('issueQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการจ่าย');

    const { error } = await supabase.rpc('issue_stock_to_sub', {
        p_item_id: 1,
        p_to_user_id: CURRENT_USER.id,
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
// 🩺 5. ฟังก์ชันฝั่งคลังย่อย (Sub Stock Functions)
// -------------------------------------------------------------

// 📝 ลงบันทึกการแจกของ (Distribute)
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

// ↩️ ส่งคืนคลังใหญ่ (Return)
document.getElementById('btnReturn')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('returnQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนที่ต้องการส่งคืน');

    const { error } = await supabase.rpc('return_stock_to_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'ส่งคืนคลังใหญ่'
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
// 📋 6. บันทึกการตรวจนับสต๊อกประจำวัน (Daily Stock Audit)
// -------------------------------------------------------------
document.getElementById('btnSaveDailyCount')?.addEventListener('click', async () => {
    const actualQtyInput = document.getElementById('actualCountQty');
    const noteInput = document.getElementById('countNote');
    const actualQty = parseInt(actualQtyInput.value);
    const note = noteInput.value.trim() || 'ตรวจนับประจำวันปกติ';

    if (isNaN(actualQty) || actualQty < 0) {
        return alert('กรุณาระบุจำนวนที่นับได้จริง');
    }

    if (!confirm(`ยืนยันการบันทึกยอดนับจริง ${actualQty} Set หรือไม่?\n(ระบบจะปรับยอดคงเหลือให้เป็น ${actualQty} Set ทันที)`)) {
        return;
    }

    const { error } = await supabase.rpc('record_daily_count', {
        p_actual_qty: actualQty,
        p_note: note
    });

    if (error) {
        console.error('Daily Count Error:', error);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
    } else {
        alert('บันทึกยอดตรวจนับและปรับยอดระบบเรียบร้อยแล้ว!');
        actualQtyInput.value = '';
        noteInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 📊 7. Export Executive Report เป็น Excel 3 Tabs (เฉพาะ Super Admin เท่านั้น)
// -------------------------------------------------------------
document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
    if (!CURRENT_USER || CURRENT_USER.role !== 'SUPER_ADMIN') {
        return alert('🚫 คุณไม่มีสิทธิ์เข้าถึงและดาวน์โหลดรายงานสรุประบบ (สิทธิ์เฉพาะ Super Admin เท่านั้น)');
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
// 🚪 8. ปุ่ม Logout (ออกจากระบบ)
// -------------------------------------------------------------
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        await supabase.auth.signOut();
        window.location.href = './index.html';
    }
});

// -------------------------------------------------------------
// เริ่มต้นตรวจสอบสิทธิ์ทันทีเมื่อโหลดสคริปต์
// -------------------------------------------------------------
initProductionUser();
