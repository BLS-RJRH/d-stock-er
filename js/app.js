import { supabase } from './supabaseClient.js';

let CURRENT_USER = null;

const MIN_CENTRAL_STOCK = 30;
const MIN_SUB_STOCK = 10;

// 🟢 ฟังก์ชัน SweetAlert2 สำหรับใช้งานซ้ำ
const toastSuccess = (title, text) => {
    Swal.fire({
        icon: 'success',
        title: title,
        text: text,
        confirmButtonColor: '#10B981',
        customClass: { popup: 'rounded-2xl' }
    });
};

const toastError = (title, text) => {
    Swal.fire({
        icon: 'error',
        title: title,
        text: text,
        confirmButtonColor: '#EF4444',
        customClass: { popup: 'rounded-2xl' }
    });
};

const toastWarning = (title, text) => {
    Swal.fire({
        icon: 'warning',
        title: title,
        text: text,
        confirmButtonColor: '#F59E0B',
        customClass: { popup: 'rounded-2xl' }
    });
};

// -------------------------------------------------------------
// 🔒 1. ตรวจสอบ Session การเข้าสู่ระบบ
// -------------------------------------------------------------
async function initProductionUser() {
    try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr || !session) {
            await Swal.fire({
                icon: 'warning',
                title: 'กรุณาเข้าสู่ระบบก่อนใช้งาน',
                confirmButtonColor: '#DC2626'
            });
            window.location.href = './index.html';
            return;
        }

        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profileErr || !profile) {
            toastError('ไม่พบข้อมูลสิทธิ์ผู้ใช้งาน', 'กรุณาติดต่อ Admin เพื่อตรวจสอบสิทธิ์');
            await supabase.auth.signOut();
            window.location.href = './index.html';
            return;
        }

        CURRENT_USER = profile;

        const nameElem = document.getElementById('userFullName');
        const badgeElem = document.getElementById('userRoleBadge');
        
        if (nameElem) nameElem.innerText = profile.full_name || session.user.email;
        if (badgeElem) {
            const roleNames = {
                'SUPER_ADMIN': '👑 Super Admin',
                'ADMIN': '🛡️ Admin',
                'CENTER_STAFF': '📦 Center Staff',
                'SUB_STAFF': '🩺 Sub Staff'
            };
            badgeElem.innerText = roleNames[profile.role] || profile.role;
        }

        setupUIByRole(profile.role);
        await loadStockData();

    } catch (err) {
        console.error('Init Production Error:', err);
        toastError('เกิดข้อผิดพลาดในการเริ่มต้นระบบ', err.message);
    }
}

// -------------------------------------------------------------
// 🎨 2. ควบคุมการแสดงผล UI
// -------------------------------------------------------------
function setupUIByRole(role) {
    const centralPanel = document.getElementById('centralPanel');
    const subPanel = document.getElementById('subPanel');
    const exportSection = document.getElementById('btnExportExcel')?.closest('div.bg-white');
    const btnManageStaff = document.getElementById('btnManageStaff');

    if (role === 'SUPER_ADMIN') {
        btnManageStaff?.classList.remove('hidden');
    } else {
        btnManageStaff?.classList.add('hidden');
    }

    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
        centralPanel?.classList.remove('hidden');
        subPanel?.classList.remove('hidden');
        exportSection?.classList.remove('hidden');
    } else if (role === 'CENTER_STAFF') {
        centralPanel?.classList.remove('hidden');
        subPanel?.classList.add('hidden');
        exportSection?.classList.add('hidden');
    } else if (role === 'SUB_STAFF') {
        centralPanel?.classList.add('hidden');
        subPanel?.classList.remove('hidden');
        exportSection?.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// 📦 3. ดึงข้อมูลสต๊อก Real-time
// -------------------------------------------------------------
async function loadStockData() {
    const { data: central } = await supabase
        .from('central_stock')
        .select('current_qty')
        .eq('item_id', 1)
        .maybeSingle();

    const centralQty = central ? central.current_qty : 0;
    const centralElem = document.getElementById('centralQtyDisplay');
    const centralCard = centralElem?.closest('.bg-red-50') || centralElem?.parentElement?.parentElement;

    if (centralElem) centralElem.innerText = centralQty;

    if (centralCard) {
        if (centralQty <= MIN_CENTRAL_STOCK) {
            centralCard.className = "bg-red-100 border-2 border-red-500 p-4 rounded-xl animate-pulse";
            if (centralElem) centralElem.innerHTML = `${centralQty} <span class="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full ml-2">⚠️ สต๊อกต่ำวิกฤต</span>`;
        } else {
            centralCard.className = "bg-red-50 border border-red-100 p-4 rounded-xl";
        }
    }

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
// 🏢 4. ฟังก์ชันฝั่งคลังใหญ่ (Restock & Issue)
// -------------------------------------------------------------
document.getElementById('btnRestock')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('restockQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่ต้องการเติมให้ถูกต้อง');

    const { error } = await supabase.rpc('restock_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'เติมของเข้าคลังใหญ่'
    });

    if (error) {
        toastError('เติมของไม่สำเร็จ', error.message);
    } else {
        toastSuccess('เติมของสำเร็จ! 🎉', `เพิ่มสต๊อกเข้าคลังใหญ่เรียบร้อยแล้ว +${qty} Set`);
        qtyInput.value = '';
        await loadStockData();
    }
});

document.getElementById('btnIssue')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('issueQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่ต้องการจ่ายออก');

    const { error } = await supabase.rpc('issue_stock_to_sub', {
        p_item_id: 1,
        p_to_user_id: CURRENT_USER.id,
        p_quantity: qty,
        p_note: 'จ่ายของให้สต๊อกย่อย'
    });

    if (error) {
        toastError('จ่ายของออกไม่สำเร็จ', error.message);
    } else {
        toastSuccess('จ่ายของออกสำเร็จ! ➡️', `ตัดสต๊อกคลังใหญ่เพื่อโอนให้คลังย่อย -${qty} Set เรียบร้อยแล้ว`);
        qtyInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 🩺 5. ฟังก์ชันฝั่งคลังย่อย (Distribute & Return)
// -------------------------------------------------------------
document.getElementById('btnDistribute')?.addEventListener('click', async () => {
    const recipientInput = document.getElementById('recipientInfo');
    const qtyInput = document.getElementById('distributeQty');
    const recipient = recipientInput.value.trim();
    const qty = parseInt(qtyInput.value);

    if (!recipient) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุผู้รับ / เลข HN / จุดงาน');
    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่ต้องการแจก');

    // 💡 ส่งค่าชื่อผู้รับเข้าฐานข้อมูลตรงๆ โดยยกเลิกคำว่า "แจกให้: "
    const { error } = await supabase.rpc('distribute_item', {
        p_item_id: 1,
        p_recipient_info: recipient,
        p_quantity: qty
    });

    if (error) {
        toastError('บันทึกการแจกไม่สำเร็จ', error.message);
    } else {
        toastSuccess('ลงบันทึกสำเร็จ! 📝', `แจกของใช้งานให้ ${recipient} จำนวน ${qty} Set เรียบร้อยแล้ว`);
        recipientInput.value = '';
        qtyInput.value = '';
        await loadStockData();
    }
});

document.getElementById('btnReturn')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('returnQty');
    const qty = parseInt(qtyInput.value);

    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่ต้องการส่งคืน');

    const { error } = await supabase.rpc('return_stock_to_central', {
        p_item_id: 1,
        p_quantity: qty,
        p_note: 'ส่งคืนคลังใหญ่'
    });

    if (error) {
        toastError('ส่งคืนของไม่สำเร็จ', error.message);
    } else {
        toastSuccess('ส่งคืนคลังใหญ่สำเร็จ! ↩️', `ส่งคืนเวชภัณฑ์จำนวน ${qty} Set เข้าคลังใหญ่เรียบร้อยแล้ว`);
        qtyInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 📋 6. บันทึกตรวจนับสต๊อกประจำเวร (Daily Stock Audit)
// -------------------------------------------------------------
document.getElementById('btnSaveDailyCount')?.addEventListener('click', async () => {
    const actualQtyInput = document.getElementById('actualCountQty');
    const noteInput = document.getElementById('countNote');
    const actualQty = parseInt(actualQtyInput.value);
    const note = noteInput.value.trim() || 'ตรวจนับประจำเวรปกติ';

    if (isNaN(actualQty) || actualQty < 0) {
        return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่นับได้จริงบนชั้นวาง');
    }

    const confirmRes = await Swal.fire({
        title: 'ยืนยันยอดตรวจนับ?',
        text: `ต้องการปรับยอดคงเหลือระบบเป็น ${actualQty} Set หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1E293B',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ยืนยันบันทึก',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (!confirmRes.isConfirmed) return;

    const { error } = await supabase.rpc('record_daily_count', {
        p_actual_qty: actualQty,
        p_note: note
    });

    if (error) {
        toastError('บันทึกตรวจนับไม่สำเร็จ', error.message);
    } else {
        toastSuccess('ปรับยอดสต๊อกสำเร็จ! 📋', 'ปรับยอดคงเหลือจริงในระบบให้ตรงกับชั้นวางเรียบร้อยแล้ว');
        actualQtyInput.value = '';
        noteInput.value = '';
        await loadStockData();
    }
});

// -------------------------------------------------------------
// 📊 7. Export Executive Report (อ่านค่าจาก Checkbox)
// -------------------------------------------------------------
document.getElementById('btnExportExcel')?.addEventListener('click', async () => {
    if (!CURRENT_USER || (CURRENT_USER.role !== 'SUPER_ADMIN' && CURRENT_USER.role !== 'ADMIN')) {
        return toastError('ปฏิเสธสิทธิ์การเข้าถึง', 'คุณไม่มีสิทธิ์ดาวน์โหลดรายงานภาพรวมระบบ');
    }

    const isRestockChecked = document.getElementById('chkRestock')?.checked;
    const isTransferChecked = document.getElementById('chkTransfer')?.checked;
    const isDistributeChecked = document.getElementById('chkDistribute')?.checked;
    const isAuditChecked = document.getElementById('chkAudit')?.checked;

    if (!isRestockChecked && !isTransferChecked && !isDistributeChecked && !isAuditChecked) {
        return toastWarning('กรุณาเลือกหัวข้อ', 'โปรดเลือกหัวข้อรายงานอย่างน้อย 1 รายการ');
    }

    const startDate = document.getElementById('exportStartDate')?.value;
    const endDate = document.getElementById('exportEndDate')?.value;

    try {
        // ดึงรายชื่อ Profile มาแปะชื่อผู้ใช้งาน
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, staff_code');
        const userMap = {};
        (profiles || []).forEach(p => {
            userMap[p.id] = p.full_name ? `${p.full_name} (${p.staff_code || '-'})` : 'ไม่ระบุชื่อ';
        });

        const workbook = XLSX.utils.book_new();

        // 🟢 1. เติมเข้าคลังใหญ่ (RESTOCK - ตัดรายการปรับยอดจากการนับประจำเวรออก)
        if (isRestockChecked) {
            let query = supabase.from('stock_transactions').select('*').eq('type', 'RESTOCK').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: restockList } = await query;

            // ✂️ กรองเฉพาะการเติมสต๊อกจริง ตัดรายการที่เป็นการปรับยอดจากการนับออก
            const filteredRestock = (restockList || []).filter(t => {
                const note = t.note || '';
                return !note.includes('ปรับยอดจากการนับ') && !note.includes('Diff:');
            });

            const restockData = filteredRestock.map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'ประเภท': 'เติมเข้าคลังใหญ่',
                'ผู้ดำเนินการ': t.to_user_id ? userMap[t.to_user_id] : (t.from_user_id ? userMap[t.from_user_id] : 'ระบบ / Admin'),
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ / เลขที่อ้างอิง': t.note || '-'
            }));
            const sheet = XLSX.utils.json_to_sheet(restockData.length ? restockData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            XLSX.utils.book_append_sheet(workbook, sheet, "1. เติมเข้าคลังใหญ่");
        }

        // 🔵 2. จ่าย-คืน คลังย่อย (ISSUE & RETURN)
        if (isTransferChecked) {
            let query = supabase.from('stock_transactions').select('*').in('type', ['ISSUE', 'RETURN']).order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: transferList } = await query;
            const transferData = (transferList || []).map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'การดำเนินการ': t.type === 'ISSUE' ? 'จ่ายให้คลังย่อย' : 'ส่งคืนคลังใหญ่',
                'ผู้รับ/ผู้ส่งคืน': t.to_user_id ? userMap[t.to_user_id] : (t.from_user_id ? userMap[t.from_user_id] : 'ผู้ใช้งานระบบ'),
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ': t.note || '-'
            }));
            const sheet = XLSX.utils.json_to_sheet(transferData.length ? transferData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            XLSX.utils.book_append_sheet(workbook, sheet, "2. จ่าย-คืน คลังย่อย");
        }

        // 🟡 3. ประวัติการแจกใช้งาน (DISTRIBUTE)
        if (isDistributeChecked) {
            let query = supabase.from('distribution_logs').select('*').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: distList } = await query;
            const distributeData = (distList || []).map(d => {
                const rawRecipient = d.recipient_info || d.note || '-';
                const cleanRecipient = rawRecipient.replace(/^แจกให้:\s*/, '');
                return {
                    'วันที่-เวลา': new Date(d.created_at).toLocaleString('th-TH'),
                    'ผู้แจก (Staff)': d.distributor_id ? userMap[d.distributor_id] : (d.from_user_id ? userMap[d.from_user_id] : 'ผู้ใช้งานระบบ'),
                    'ผู้รับ': cleanRecipient,
                    'จำนวนที่แจก (Set)': d.quantity
                };
            });
            const sheet = XLSX.utils.json_to_sheet(distributeData.length ? distributeData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            XLSX.utils.book_append_sheet(workbook, sheet, "3. ประวัติการแจกใช้งาน");
        }

        // 📋 4. บันทึกตรวจนับประจำเวร (DAILY AUDIT - ดึงคอลัมน์ counted_by โดยตรง)
        if (isAuditChecked) {
            let query = supabase.from('daily_stock_counts').select('*').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: auditList } = await query;
            const auditData = (auditList || []).map(a => {
                const userId = a.counted_by || a.recorder_id || a.created_by;
                const staffName = userId && userMap[userId] ? userMap[userId] : 'ผู้ใช้งานระบบ';

                return {
                    'วันที่-เวลา ตรวจนับ': new Date(a.created_at || a.count_date).toLocaleString('th-TH'),
                    'ผู้ตรวจนับ (Staff)': staffName,
                    'จำนวนที่นับได้จริง (Set)': a.actual_qty ?? a.quantity ?? 0,
                    'หมายเหตุ': a.note || '-'
                };
            });
            const sheet = XLSX.utils.json_to_sheet(auditData.length ? auditData : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            XLSX.utils.book_append_sheet(workbook, sheet, "4. สรุปยอดนับประจำเวร");
        }

        const dateStr = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `D-Stock_ER_Report_${dateStr}.xlsx`);
        
        toastSuccess('ส่งออกรายงานสำเร็จ 📥', 'ดาวน์โหลดไฟล์ Excel สรุปข้อมูลหัวข้อที่เลือกเรียบร้อยแล้ว');

    } catch (err) {
        console.error('Export Error:', err);
        toastError('เกิดข้อผิดพลาดในการดึงรายงาน', err.message);
    }
});

// -------------------------------------------------------------
// 🚪 8. ปุ่ม Logout
// -------------------------------------------------------------
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    const confirmRes = await Swal.fire({
        title: 'ยืนยันออกจากระบบ?',
        text: 'คุณต้องการออกจากระบบ D-Stock ER ใช่หรือไม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (confirmRes.isConfirmed) {
        await supabase.auth.signOut();
        window.location.href = './index.html';
    }
});

initProductionUser();
