import { supabase } from './supabaseClient.js';

let CURRENT_USER = null;
let USER_MAP = {};

const MIN_CENTRAL_STOCK = 30;
const MIN_SUB_STOCK = 10;

// 🟢 Toast Helper Functions (SweetAlert2)
const showToast = (icon, title, text, confirmButtonColor) => {
    return Swal.fire({
        icon,
        title,
        text,
        confirmButtonColor,
        customClass: { popup: 'rounded-2xl' }
    });
};

const toastSuccess = (title, text) => showToast('success', title, text, '#10B981');
const toastError = (title, text) => showToast('error', title, text, '#EF4444');
const toastWarning = (title, text) => showToast('warning', title, text, '#F59E0B');

// 🔄 Helper: โหลด User Profiles เก็บเป็น Cache Map
async function fetchUserProfiles() {
    try {
        const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, staff_code');
        if (error) throw error;
        USER_MAP = {};
        (profiles || []).forEach(p => {
            USER_MAP[p.id] = p.full_name ? `${p.full_name} (${p.staff_code || '-'})` : 'ไม่ระบุชื่อ';
        });
    } catch (err) {
        console.warn('Profiles Sync Warning:', err.message);
    }
}

// 🔄 Helper: โหลดข้อมูลใหม่หลังทำธุรกรรม
async function refreshAppData() {
    await loadStockData();
    if (CURRENT_USER && (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN')) {
        await loadActivityLogs();
    }
}

// -------------------------------------------------------------
// 🔒 1. ตรวจสอบ Session & Profile
// -------------------------------------------------------------
async function initProductionUser() {
    try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();

        if (sessionErr || !session) {
            await showToast('warning', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', '', '#DC2626');
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

        setupTabsNav();
        setupUIByRole(profile.role);
        
        await fetchUserProfiles();
        await refreshAppData();

    } catch (err) {
        console.error('Init Error:', err);
        toastError('เกิดข้อผิดพลาดในการเริ่มต้นระบบ', err.message);
    }
}

// -------------------------------------------------------------
// 🧭 1.5 Tab Switching System
// -------------------------------------------------------------
function setupTabsNav() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-tab');

            tabBtns.forEach(b => {
                b.classList.remove('bg-slate-800', 'text-white', 'shadow-sm');
                b.classList.add('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
            });
            btn.classList.remove('bg-slate-100', 'text-slate-600', 'hover:bg-slate-200');
            btn.classList.add('bg-slate-800', 'text-white', 'shadow-sm');

            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== targetTabId);
            });
        });
    });
}

// -------------------------------------------------------------
// 🎨 2. UI Role Controller
// -------------------------------------------------------------
function setupUIByRole(role) {
    const btnManageStaff = document.getElementById('btnManageStaff');
    const btnExportPDF = document.getElementById('btnExportPDF');
    const navTabsContainer = document.getElementById('navTabsContainer');
    
    const tabCentral = document.getElementById('tabCentral');
    const tabSub = document.getElementById('tabSub');
    const tabLog = document.getElementById('tabLog');
    const tabExport = document.getElementById('tabExport');

    if (role === 'SUPER_ADMIN') {
        btnManageStaff?.classList.remove('hidden');
        btnExportPDF?.classList.remove('hidden'); 
        btnExportPDF?.classList.add('flex');
    } else {
        btnManageStaff?.classList.add('hidden');
        btnExportPDF?.classList.add('hidden'); 
        btnExportPDF?.classList.remove('flex');
    }

    if (role === 'CENTER_STAFF' || role === 'SUB_STAFF') {
        if (navTabsContainer) navTabsContainer.style.display = 'none';
        tabLog?.classList.add('hidden');
        tabExport?.classList.add('hidden');

        if (role === 'CENTER_STAFF') {
            tabCentral?.classList.remove('hidden');
            tabSub?.classList.add('hidden');
        } else {
            tabCentral?.classList.add('hidden');
            tabSub?.classList.remove('hidden');
        }
    } else if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        if (navTabsContainer) navTabsContainer.style.display = 'flex';
        document.querySelector('[data-tab="tabCentral"]')?.click();
    }
}

// -------------------------------------------------------------
// 📦 3. Stock Monitor
// -------------------------------------------------------------
async function loadStockData() {
    const [{ data: central }, { data: sub }] = await Promise.all([
        supabase.from('central_stock').select('current_qty').eq('item_id', 1).maybeSingle(),
        supabase.from('sub_stock').select('current_qty').eq('item_id', 1).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    const centralQty = central ? central.current_qty : 0;
    const centralElem = document.getElementById('centralQtyDisplay');
    const centralCard = centralElem?.closest('.bg-red-50') || centralElem?.parentElement?.parentElement;

    if (centralElem) centralElem.innerText = centralQty;
    if (centralCard) {
        const isCritical = centralQty <= MIN_CENTRAL_STOCK;
        centralCard.className = isCritical ? "bg-red-100 border-2 border-red-500 p-4 rounded-xl animate-pulse" : "bg-red-50 border border-red-100 p-4 rounded-xl";
        if (isCritical && centralElem) {
            centralElem.innerHTML = `${centralQty} <span class="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full ml-2">⚠️ สต๊อกต่ำวิกฤต</span>`;
        }
    }

    const subQty = sub ? sub.current_qty : 0;
    const subElem = document.getElementById('subQtyDisplay');
    const subCard = subElem?.closest('.bg-blue-50') || subElem?.parentElement?.parentElement;

    if (subElem) subElem.innerText = subQty;
    if (subCard) {
        const isLow = subQty <= MIN_SUB_STOCK;
        subCard.className = isLow ? "bg-amber-100 border-2 border-amber-500 p-4 rounded-xl animate-pulse" : "bg-blue-50 border border-blue-100 p-4 rounded-xl";
        if (isLow && subElem) {
            subElem.innerHTML = `${subQty} <span class="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full ml-2">⚠️ สต๊อกย่อยใกล้หมด</span>`;
        }
    }
}

// -------------------------------------------------------------
// 📜 3.5 Activity Log
// -------------------------------------------------------------
async function loadActivityLogs() {
    const tableBody = document.getElementById('activityLogTableBody');
    if (!tableBody) return;

    try {
        const [
            { data: txList },
            { data: distList },
            { data: auditList }
        ] = await Promise.all([
            supabase.from('stock_transactions').select('*').order('created_at', { ascending: false }).limit(20),
            supabase.from('distribution_logs').select('*').order('created_at', { ascending: false }).limit(20),
            supabase.from('daily_stock_counts').select('*').order('created_at', { ascending: false }).limit(20)
        ]);

        const combinedLogs = [];

        (txList || []).forEach(t => {
            const badges = {
                'RESTOCK': `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">➕ เติมคลังใหญ่</span>`,
                'ISSUE': `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">➡️ จ่ายให้คลังย่อย</span>`,
                'RETURN': `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">↩️ ส่งคืนคลังใหญ่</span>`
            };
            const actions = {
                'RESTOCK': t.note || 'เติมสต๊อกคลังใหญ่',
                'ISSUE': t.note || 'โอนย้ายไปคลังย่อย EMS',
                'RETURN': t.note || 'คืนเวชภัณฑ์เข้าคลังใหญ่'
            };

            if (badges[t.type]) {
                combinedLogs.push({
                    created_at: new Date(t.created_at),
                    badge: badges[t.type],
                    user: t.to_user_id ? USER_MAP[t.to_user_id] : (t.from_user_id ? USER_MAP[t.from_user_id] : 'ระบบ / Admin'),
                    qty: `${t.quantity} Set`,
                    detail: actions[t.type]
                });
            }
        });

        (distList || []).forEach(d => {
            const cleanRecipient = (d.recipient_info || d.note || '-').replace(/^แจกให้:\s*/, '');
            combinedLogs.push({
                created_at: new Date(d.created_at),
                badge: `<span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold">📝 แจกใช้งาน</span>`,
                user: d.distributor_id ? USER_MAP[d.distributor_id] : 'ผู้ใช้งานระบบ',
                qty: `${d.quantity} Set`,
                detail: `แจกให้: ${cleanRecipient}`
            });
        });

        (auditList || []).forEach(a => {
            const userId = a.counted_by || a.recorder_id || a.created_by;
            combinedLogs.push({
                created_at: new Date(a.created_at || a.count_date),
                badge: `<span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-semibold">📋 ตรวจนับประจำเวร</span>`,
                user: userId && USER_MAP[userId] ? USER_MAP[userId] : 'ผู้ใช้งานระบบ',
                qty: `${a.actual_qty ?? a.quantity ?? 0} Set`,
                detail: a.note || 'ตรวจนับยอดคงเหลือ'
            });
        });

        combinedLogs.sort((a, b) => b.created_at - a.created_at);
        const top20Logs = combinedLogs.slice(0, 20);

        if (top20Logs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">ยังไม่มีประวัติกิจกรรมในระบบ</td></tr>`;
            return;
        }

        tableBody.innerHTML = top20Logs.map(log => `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-2.5 whitespace-nowrap text-slate-500">${log.created_at.toLocaleString('th-TH')}</td>
                <td class="p-2.5 whitespace-nowrap">${log.badge}</td>
                <td class="p-2.5 font-medium whitespace-nowrap">${log.user}</td>
                <td class="p-2.5 text-center font-bold text-slate-800 whitespace-nowrap">${log.qty}</td>
                <td class="p-2.5 text-slate-600">${log.detail}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Activity Logs Error:', err);
        tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
    }
}

// -------------------------------------------------------------
// 🏢 4. ฟังก์ชันคลังใหญ่
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
        await refreshAppData();
    }
});

document.getElementById('btnIssue')?.addEventListener('click', async () => {
    const qtyInput = document.getElementById('issueQty');
    const qty = parseInt(qtyInput.value);
    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่จ่ายออก');

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
        await refreshAppData();
    }
});

document.getElementById('btnSaveCentralDailyCount')?.addEventListener('click', async () => {
    const actualQtyInput = document.getElementById('centralActualCountQty');
    const noteInput = document.getElementById('centralCountNote');
    const actualQty = parseInt(actualQtyInput.value);
    const note = noteInput.value.trim();

    if (isNaN(actualQty) || actualQty < 0) {
        return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่นับได้จริงในคลังใหญ่');
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันบันทึกยอดตรวจนับ?',
        text: `ต้องการบันทึกประวัติการตรวจนับคลังใหญ่จำนวน ${actualQty} Set หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1E293B',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ยืนยันบันทึก',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (!isConfirmed) return;

    const { error } = await supabase.rpc('record_central_daily_count', {
        p_actual_qty: actualQty,
        p_note: note
    });

    if (error) {
        toastError('บันทึกตรวจนับคลังใหญ่ไม่สำเร็จ', error.message);
    } else {
        toastSuccess('บันทึกยอดตรวจนับสำเร็จ! 📋', 'บันทึกประวัติการตรวจนับคลังใหญ่เรียบร้อยแล้ว');
        actualQtyInput.value = '';
        noteInput.value = '';
        await refreshAppData();
    }
});

// -------------------------------------------------------------
// 🩺 5. ฟังก์ชันคลังย่อย
// -------------------------------------------------------------
document.getElementById('recipientSelect')?.addEventListener('change', (e) => {
    const otherInput = document.getElementById('recipientOtherInput');
    if (!otherInput) return;
    const isOther = e.target.value === 'OTHER';
    otherInput.classList.toggle('hidden', !isOther);
    if (isOther) otherInput.focus();
    else otherInput.value = '';
});

document.getElementById('btnDistribute')?.addEventListener('click', async () => {
    const recipientSelect = document.getElementById('recipientSelect');
    const recipientOtherInput = document.getElementById('recipientOtherInput');
    const qtyInput = document.getElementById('distributeQty');
    
    const selectedValue = recipientSelect ? recipientSelect.value : '';
    const otherText = recipientOtherInput ? recipientOtherInput.value.trim() : '';
    const qty = parseInt(qtyInput ? qtyInput.value : '0');

    let recipient = selectedValue === 'OTHER' ? otherText : selectedValue;

    if (!recipient) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุหรือเลือกผู้รับเวชภัณฑ์');
    if (!qty || qty <= 0) return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่ต้องการแจก');

    const { error } = await supabase.rpc('distribute_item', {
        p_item_id: 1,
        p_recipient_info: recipient,
        p_quantity: qty
    });

    if (error) {
        toastError('บันทึกการแจกไม่สำเร็จ', error.message);
    } else {
        toastSuccess('ลงบันทึกสำเร็จ! 📝', `แจกของใช้งานให้ ${recipient} จำนวน ${qty} Set เรียบร้อยแล้ว`);
        if (recipientSelect) recipientSelect.value = '';
        if (recipientOtherInput) {
            recipientOtherInput.value = '';
            recipientOtherInput.classList.add('hidden');
        }
        if (qtyInput) qtyInput.value = '';
        await refreshAppData();
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
        await refreshAppData();
    }
});

document.getElementById('btnSaveDailyCount')?.addEventListener('click', async () => {
    const actualQtyInput = document.getElementById('actualCountQty');
    const noteInput = document.getElementById('countNote');
    const actualQty = parseInt(actualQtyInput.value);
    const note = noteInput.value.trim();

    if (isNaN(actualQty) || actualQty < 0) {
        return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุจำนวนที่นับได้จริงบนชั้นวางคลังย่อย');
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันบันทึกยอดตรวจนับ?',
        text: `ต้องการบันทึกประวัติการตรวจนับคลังย่อยจำนวน ${actualQty} Set หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#1E293B',
        cancelButtonColor: '#94A3B8',
        confirmButtonText: 'ยืนยันบันทึก',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-2xl' }
    });

    if (!isConfirmed) return;

    const { error } = await supabase.rpc('record_daily_count', {
        p_actual_qty: actualQty,
        p_note: note
    });

    if (error) {
        toastError('บันทึกตรวจนับคลังย่อยไม่สำเร็จ', error.message);
    } else {
        toastSuccess('บันทึกยอดตรวจนับสำเร็จ! 📋', 'บันทึกประวัติการตรวจนับคลังย่อยเรียบร้อยแล้ว');
        actualQtyInput.value = '';
        noteInput.value = '';
        await refreshAppData();
    }
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', async () => {
    await fetchUserProfiles();
    await loadActivityLogs();
    toastSuccess('อัปเดตข้อมูลสำเร็จ 🔄', 'ดึงข้อมูลกิจกรรมล่าสุดเรียบร้อยแล้ว');
});

// -------------------------------------------------------------
// 📊 7.1 Export Excel Report
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

    const btnExcel = document.getElementById('btnExportExcel');
    const originalText = btnExcel.innerHTML;

    try {
        btnExcel.disabled = true;
        btnExcel.classList.add('opacity-50', 'cursor-not-allowed');
        btnExcel.innerHTML = `<span>⏳ กำลังสร้าง Excel...</span>`;

        const startDate = document.getElementById('exportStartDate')?.value;
        const endDate = document.getElementById('exportEndDate')?.value;
        
        await fetchUserProfiles();
        const workbook = XLSX.utils.book_new();

        const createSheetWithWidth = (dataList) => {
            const sheet = XLSX.utils.json_to_sheet(dataList.length ? dataList : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            if (dataList.length > 0) {
                const colWidths = Object.keys(dataList[0]).map(key => {
                    let maxLen = key.toString().length;
                    dataList.forEach(row => {
                        const val = row[key] ? row[key].toString() : '';
                        if (val.length > maxLen) maxLen = val.length;
                    });
                    return { wch: Math.max(maxLen + 5, 18) };
                });
                sheet['!cols'] = colWidths;
            }
            return sheet;
        };

        const applyDateFilter = (query) => {
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
            return query;
        };

        if (isRestockChecked) {
            let query = supabase.from('stock_transactions').select('*').eq('type', 'RESTOCK').order('created_at', { ascending: false });
            const { data: restockList } = await applyDateFilter(query);
            const filtered = (restockList || []).filter(t => !(t.note || '').includes('ปรับยอดจากการนับ') && !(t.note || '').includes('Diff:'));
            const restockData = filtered.map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'ประเภท': 'เติมเข้าคลังใหญ่',
                'ผู้ดำเนินการ': t.to_user_id ? USER_MAP[t.to_user_id] : (t.from_user_id ? USER_MAP[t.from_user_id] : 'ระบบ / Admin'),
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ / เลขที่อ้างอิง': t.note || '-'
            }));
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(restockData), "1. เติมเข้าคลังใหญ่");
        }

        if (isTransferChecked) {
            let query = supabase.from('stock_transactions').select('*').in('type', ['ISSUE', 'RETURN']).order('created_at', { ascending: false });
            const { data: transferList } = await applyDateFilter(query);
            const transferData = (transferList || []).map(t => ({
                'วันที่-เวลา': new Date(t.created_at).toLocaleString('th-TH'),
                'การดำเนินการ': t.type === 'ISSUE' ? 'จ่ายให้คลังย่อย' : 'ส่งคืนคลังใหญ่',
                'ผู้รับ/ผู้ส่งคืน': t.to_user_id ? USER_MAP[t.to_user_id] : (t.from_user_id ? USER_MAP[t.from_user_id] : 'ผู้ใช้งานระบบ'),
                'จำนวน (Set)': t.quantity,
                'หมายเหตุ': t.note || '-'
            }));
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(transferData), "2. จ่าย-คืน คลังย่อย");
        }

        if (isDistributeChecked) {
            let query = supabase.from('distribution_logs').select('*').order('created_at', { ascending: false });
            const { data: distList } = await applyDateFilter(query);
            const distributeData = (distList || []).map(d => ({
                'วันที่-เวลา': new Date(d.created_at).toLocaleString('th-TH'),
                'ผู้แจก (Staff)': d.distributor_id ? USER_MAP[d.distributor_id] : (d.from_user_id ? USER_MAP[d.from_user_id] : 'ผู้ใช้งานระบบ'),
                'ผู้รับ': (d.recipient_info || d.note || '-').replace(/^แจกให้:\s*/, ''),
                'จำนวนที่แจก (Set)': d.quantity
            }));
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(distributeData), "3. ประวัติการแจกใช้งาน");
        }

        if (isAuditChecked) {
            let query = supabase.from('daily_stock_counts').select('*').order('created_at', { ascending: false });
            const { data: auditList } = await applyDateFilter(query);
            const auditData = (auditList || []).map(a => {
                const userId = a.counted_by || a.recorder_id || a.created_by;
                return {
                    'วันที่-เวลา ตรวจนับ': new Date(a.created_at || a.count_date).toLocaleString('th-TH'),
                    'ผู้ตรวจนับ (Staff)': userId && USER_MAP[userId] ? USER_MAP[userId] : 'ผู้ใช้งานระบบ',
                    'จำนวนที่นับได้จริง (Set)': a.actual_qty ?? a.quantity ?? 0,
                    'ยอดในระบบ (Set)': a.system_qty ?? '-',
                    'ผลต่าง (Diff)': a.diff_qty ?? 0,
                    'รายละเอียดสรุป': a.note || '-'
                };
            });
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(auditData), "4. สรุปยอดนับประจำเวร");
        }

        const dateStr = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `D-Stock_ER_Report_${dateStr}.xlsx`);
        toastSuccess('ส่งออก Excel สำเร็จ 📥', 'ดาวน์โหลดไฟล์ Excel สรุปข้อมูลเรียบร้อยแล้ว');

    } catch (err) {
        console.error('Export Excel Error:', err);
        toastError('เกิดข้อผิดพลาดในการดึงรายงาน', err.message);
    } finally {
        btnExcel.disabled = false;
        btnExcel.classList.remove('opacity-50', 'cursor-not-allowed');
        btnExcel.innerHTML = originalText;
    }
});

// -------------------------------------------------------------
// 📄 7.2 Export PDF Report (ปรับให้เต็มหน้ากระดาษ 33 แถว/หน้า ไม่เหลือช่องว่าง)
// -------------------------------------------------------------
document.getElementById('btnExportPDF')?.addEventListener('click', async () => {
    if (!CURRENT_USER || CURRENT_USER.role !== 'SUPER_ADMIN') {
        return toastError('ปฏิเสธสิทธิ์การเข้าถึง', 'สิทธิ์ดาวน์โหลด PDF สงวนไว้เฉพาะ Super Admin เท่านั้น');
    }

    const isRestockChecked = document.getElementById('chkRestock')?.checked;
    const isTransferChecked = document.getElementById('chkTransfer')?.checked;
    const isDistributeChecked = document.getElementById('chkDistribute')?.checked;
    const isAuditChecked = document.getElementById('chkAudit')?.checked;

    if (!isRestockChecked && !isTransferChecked && !isDistributeChecked && !isAuditChecked) {
        return toastWarning('กรุณาเลือกหัวข้อ', 'โปรดเลือกหัวข้อรายงานอย่างน้อย 1 รายการ');
    }

    if (typeof html2pdf === 'undefined') {
        return toastError('ไม่พบการอ้างอิงไฟล์ PDF', 'กรุณาตรวจสอบ CDN ของ html2pdf ในหน้าเว็บ');
    }

    const btnPDF = document.getElementById('btnExportPDF');
    const originalText = btnPDF.innerHTML;

    try {
        btnPDF.disabled = true;
        btnPDF.classList.add('opacity-50', 'cursor-not-allowed');
        btnPDF.innerHTML = `<span>⏳ กำลังสร้าง PDF...</span>`;

        Swal.fire({
            title: 'กำลังสร้างไฟล์ PDF...',
            text: 'กรุณารอครู่หนึ่ง ระบบกำลังรวบรวมข้อมูล',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const startDate = document.getElementById('exportStartDate')?.value;
        const endDate = document.getElementById('exportEndDate')?.value;
        await fetchUserProfiles();

        const printContainer = document.createElement('div');
        printContainer.style.fontFamily = "'THSarabunNew', 'Prompt', sans-serif";
        printContainer.style.color = "#1e293b";
        printContainer.style.backgroundColor = "#ffffff";

        let globalPageNumber = 1;

        // 🎯 ปรับ default เป็น 33 แถวต่อหน้า เพื่อใช้พื้นที่หน้ากระดาษ A4 ให้เต็มเป๊ะ
        const buildPaginatedSectionHTML = (titleText, headers, rowsData, rowsPerPage = 33) => {
            let sectionHTML = '';
            const headerHTML = headers.map(h => `<th style="padding: 4px 6px; font-size: 15px; font-weight: bold; text-align: left; background-color: #1e293b; color: #ffffff;">${h}</th>`).join('');

            const getPageWrapper = (innerBody) => `
                <div class="pdf-page" style="page-break-after: always; padding: 0; margin: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 2px; margin-bottom: 6px;">
                        <div>
                            <h2 style="font-size: 18px; font-weight: bold; margin: 0; padding: 0; color: #0f172a; line-height: 1.2;">รายงาน D-Stock ER: ${titleText}</h2>
                            <p style="font-size: 12px; color: #475569; margin: 2px 0 0 0; padding: 0;">ช่วงวันที่: ${startDate || 'ทั้งหมด'} ถึง ${endDate || 'ปัจจุบัน'} | ผู้พิมพ์: ${CURRENT_USER.full_name || 'Super Admin'}</p>
                        </div>
                        <div style="font-size: 16px; font-weight: bold; color: #0f172a; white-space: nowrap; padding-left: 10px;">
                            หน้า ${globalPageNumber++}
                        </div>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
                        <thead><tr>${headerHTML}</tr></thead>
                        <tbody>${innerBody}</tbody>
                    </table>
                </div>
            `;

            if (!rowsData || rowsData.length === 0) {
                return getPageWrapper(`<tr><td colspan="${headers.length}" style="text-align: center; padding: 6px; font-size: 14px; color: #64748b;">ไม่มีข้อมูล</td></tr>`);
            }

            const totalPages = Math.ceil(rowsData.length / rowsPerPage);
            for (let i = 0; i < totalPages; i++) {
                const chunk = rowsData.slice(i * rowsPerPage, (i + 1) * rowsPerPage);
                const rowsHTML = chunk.map(row => `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        ${row.map(cell => `<td style="padding: 3px 6px; font-size: 13.5px; line-height: 1.2;">${cell}</td>`).join('')}
                    </tr>
                `).join('');
                sectionHTML += getPageWrapper(rowsHTML);
            }

            return sectionHTML;
        };

        const applyDateFilter = (query) => {
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
            return query;
        };

        let fullHTML = '';

        // 1. เติมเข้าคลังใหญ่
        if (isRestockChecked) {
            let query = supabase.from('stock_transactions').select('*').eq('type', 'RESTOCK').order('created_at', { ascending: false });
            const { data: list } = await applyDateFilter(query);
            const filtered = (list || []).filter(t => !(t.note || '').includes('ปรับยอดจากการนับ') && !(t.note || '').includes('Diff:'));
            const rows = filtered.map(t => [
                new Date(t.created_at).toLocaleString('th-TH'),
                t.to_user_id && USER_MAP[t.to_user_id] ? USER_MAP[t.to_user_id] : (t.from_user_id && USER_MAP[t.from_user_id] ? USER_MAP[t.from_user_id] : 'ระบบ / Admin'),
                `${t.quantity} Set`,
                t.note || '-'
            ]);
            fullHTML += buildPaginatedSectionHTML("1. รายงานการเติมเข้าคลังใหญ่", ['วันที่-เวลา', 'ผู้ดำเนินการ', 'จำนวน', 'หมายเหตุ'], rows, 33);
        }

        // 2. จ่าย-คืน คลังย่อย
        if (isTransferChecked) {
            let query = supabase.from('stock_transactions').select('*').in('type', ['ISSUE', 'RETURN']).order('created_at', { ascending: false });
            const { data: list } = await applyDateFilter(query);
            const rows = (list || []).map(t => [
                new Date(t.created_at).toLocaleString('th-TH'),
                t.type === 'ISSUE' ? 'จ่ายให้คลังย่อย' : 'ส่งคืนคลังใหญ่',
                t.to_user_id && USER_MAP[t.to_user_id] ? USER_MAP[t.to_user_id] : (t.from_user_id && USER_MAP[t.from_user_id] ? USER_MAP[t.from_user_id] : 'ผู้ใช้งานระบบ'),
                `${t.quantity} Set`
            ]);
            fullHTML += buildPaginatedSectionHTML("2. รายงานการจ่าย-คืน คลังย่อย", ['วันที่-เวลา', 'การดำเนินการ', 'ผู้รับ/ผู้ส่งคืน', 'จำนวน'], rows, 33);
        }

        // 3. ประวัติการแจกใช้งาน
        if (isDistributeChecked) {
            let query = supabase.from('distribution_logs').select('*').order('created_at', { ascending: false });
            const { data: list } = await applyDateFilter(query);
            const rows = (list || []).map(d => [
                new Date(d.created_at).toLocaleString('th-TH'),
                d.distributor_id && USER_MAP[d.distributor_id] ? USER_MAP[d.distributor_id] : 'ผู้ใช้งานระบบ',
                (d.recipient_info || d.note || '-').replace(/^แจกให้:\s*/, ''),
                `${d.quantity} Set`
            ]);
            fullHTML += buildPaginatedSectionHTML("3. ประวัติการแจกใช้งาน", ['วันที่-เวลา', 'ผู้แจก (Staff)', 'ผู้รับเวชภัณฑ์', 'จำนวนที่แจก'], rows, 33);
        }

        // 4. สรุปยอดนับประจำเวร
        if (isAuditChecked) {
            let query = supabase.from('daily_stock_counts').select('*').order('created_at', { ascending: false });
            const { data: list } = await applyDateFilter(query);
            const rows = (list || []).map(a => [
                new Date(a.created_at || a.count_date).toLocaleString('th-TH'),
                a.counted_by && USER_MAP[a.counted_by] ? USER_MAP[a.counted_by] : 'ผู้ใช้งานระบบ',
                `${a.actual_qty ?? 0} Set`,
                a.note || '-'
            ]);
            fullHTML += buildPaginatedSectionHTML("4. สรุปยอดนับประจำเวร", ['วันที่-เวลา ตรวจนับ', 'ผู้ตรวจนับ (Staff)', 'นับได้จริง', 'รายละเอียด'], rows, 33);
        }

        printContainer.innerHTML = fullHTML;
        const dateStr = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
        
        const opt = {
            margin:       [4, 6, 4, 6],
            filename:     `D-Stock_ER_Report_${dateStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        await html2pdf().set(opt).from(printContainer).save();
        printContainer.remove();

        Swal.close();
        toastSuccess('ส่งออก PDF สำเร็จ 📄', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว');

    } catch (err) {
        Swal.close();
        console.error('Export PDF Error:', err);
        toastError('เกิดข้อผิดพลาดในการสร้าง PDF', err.message || 'โปรดลองใหม่อีกครั้ง');
    } finally {
        btnPDF.disabled = false;
        btnPDF.classList.remove('opacity-50', 'cursor-not-allowed');
        btnPDF.innerHTML = originalText;
    }
});
// -------------------------------------------------------------
// 🚪 8. ปุ่ม Logout
// -------------------------------------------------------------
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    const { isConfirmed } = await Swal.fire({
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

    if (isConfirmed) {
        await supabase.auth.signOut();
        window.location.href = './index.html';
    }
});

initProductionUser();
