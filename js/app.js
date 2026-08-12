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

        setupTabsNav();
        setupUIByRole(profile.role);
        await loadStockData();
        
        if (profile.role === 'SUPER_ADMIN' || profile.role === 'ADMIN') {
            await loadActivityLogs();
        }

    } catch (err) {
        console.error('Init Production Error:', err);
        toastError('เกิดข้อผิดพลาดในการเริ่มต้นระบบ', err.message);
    }
}

// -------------------------------------------------------------
// 🧭 1.5 ระบบสลับหน้าเมนู (Tab Switching System)
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
                if (content.id === targetTabId) {
                    content.classList.remove('hidden');
                } else {
                    content.classList.add('hidden');
                }
            });
        });
    });
}

// -------------------------------------------------------------
// 🎨 2. ควบคุมการแสดงผล UI ตามสิทธิ์ใช้งานอย่างรัดกุม (ซ่อนเมนู Staff ทั่วไป)
// -------------------------------------------------------------
function setupUIByRole(role) {
    const btnManageStaff = document.getElementById('btnManageStaff');
    const btnExportPDF = document.getElementById('btnExportPDF');
    const navTabsContainer = document.getElementById('navTabsContainer');
    
    const tabCentral = document.getElementById('tabCentral');
    const tabSub = document.getElementById('tabSub');
    const tabLog = document.getElementById('tabLog');
    const tabExport = document.getElementById('tabExport');

    // 👥 ปุ่มจัดการ Staff และ PDF (เฉพาะ Super Admin)
    if (role === 'SUPER_ADMIN') {
        btnManageStaff?.classList.remove('hidden');
        btnExportPDF?.classList.remove('hidden'); 
        btnExportPDF?.classList.add('flex');
    } else {
        btnManageStaff?.classList.add('hidden');
        btnExportPDF?.classList.add('hidden'); 
        btnExportPDF?.classList.remove('flex');
    }

    // 🔒 ซ่อนแท็บเมนูสำหรับ Staff ทั่วไป เพื่อไม่ให้เห็นโครงสร้างระบบ
    if (role === 'CENTER_STAFF') {
        if (navTabsContainer) navTabsContainer.style.display = 'none';

        if (tabCentral) tabCentral.classList.remove('hidden');
        if (tabSub) tabSub.classList.add('hidden');
        if (tabLog) tabLog.classList.add('hidden');
        if (tabExport) tabExport.classList.add('hidden');

    } else if (role === 'SUB_STAFF') {
        if (navTabsContainer) navTabsContainer.style.display = 'none';

        if (tabCentral) tabCentral.classList.add('hidden');
        if (tabSub) tabSub.classList.remove('hidden');
        if (tabLog) tabLog.classList.add('hidden');
        if (tabExport) tabExport.classList.add('hidden');

    } else if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        if (navTabsContainer) navTabsContainer.style.display = 'flex';
        
        const tabCentralBtn = document.querySelector('[data-tab="tabCentral"]');
        if (tabCentralBtn) tabCentralBtn.click();
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
// 📜 3.5 ดึงข้อมูล Activity Log มาแสดงผลบนหน้าเว็บเรียลไทม์ (20 รายการล่าสุด)
// -------------------------------------------------------------
async function loadActivityLogs() {
    const tableBody = document.getElementById('activityLogTableBody');
    if (!tableBody) return;

    try {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, staff_code');
        const userMap = {};
        (profiles || []).forEach(p => {
            userMap[p.id] = p.full_name ? `${p.full_name} (${p.staff_code || '-'})` : 'ไม่ระบุชื่อ';
        });

        const { data: txList } = await supabase
            .from('stock_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        const { data: distList } = await supabase
            .from('distribution_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        const { data: auditList } = await supabase
            .from('daily_stock_counts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        const combinedLogs = [];

        (txList || []).forEach(t => {
            const note = t.note || '';
            if (note.includes('ปรับยอดจากการนับ') || note.includes('Diff:')) return;

            let badge = '';
            let actionText = '';

            if (t.type === 'RESTOCK') {
                badge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">➕ เติมคลังใหญ่</span>`;
                actionText = note || 'เติมสต๊อกคลังใหญ่';
            } else if (t.type === 'ISSUE') {
                badge = `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">➡️ จ่ายให้คลังย่อย</span>`;
                actionText = note || 'โอนย้ายไปคลังย่อย EMS';
            } else if (t.type === 'RETURN') {
                badge = `<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">↩️ ส่งคืนคลังใหญ่</span>`;
                actionText = note || 'คืนเวชภัณฑ์เข้าคลังใหญ่';
            } else {
                return;
            }

            combinedLogs.push({
                created_at: new Date(t.created_at),
                badge: badge,
                user: t.to_user_id ? userMap[t.to_user_id] : (t.from_user_id ? userMap[t.from_user_id] : 'ระบบ / Admin'),
                qty: `${t.quantity} Set`,
                detail: actionText
            });
        });

        (distList || []).forEach(d => {
            const rawRecipient = d.recipient_info || d.note || '-';
            const cleanRecipient = rawRecipient.replace(/^แจกให้:\s*/, '');
            combinedLogs.push({
                created_at: new Date(d.created_at),
                badge: `<span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-semibold">📝 แจกใช้งาน</span>`,
                user: d.distributor_id ? userMap[d.distributor_id] : 'ผู้ใช้งานระบบ',
                qty: `${d.quantity} Set`,
                detail: `แจกให้: ${cleanRecipient}`
            });
        });

        (auditList || []).forEach(a => {
            const userId = a.counted_by || a.recorder_id || a.created_by;
            combinedLogs.push({
                created_at: new Date(a.created_at || a.count_date),
                badge: `<span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-semibold">📋 ตรวจนับประจำเวร</span>`,
                user: userId && userMap[userId] ? userMap[userId] : 'ผู้ใช้งานระบบ',
                qty: `${a.actual_qty ?? a.quantity ?? 0} Set`,
                detail: a.note || 'นับยอดจริงบนชั้นวาง'
            });
        });

        combinedLogs.sort((a, b) => b.created_at - a.created_at);
        const top20Logs = combinedLogs.slice(0, 20);

        if (top20Logs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">ยังไม่มีประวัติกิจกรรมในระบบ</td></tr>`;
            return;
        }

        let html = '';
        top20Logs.forEach(log => {
            html += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-2.5 whitespace-nowrap text-slate-500">${log.created_at.toLocaleString('th-TH')}</td>
                    <td class="p-2.5 whitespace-nowrap">${log.badge}</td>
                    <td class="p-2.5 font-medium whitespace-nowrap">${log.user}</td>
                    <td class="p-2.5 text-center font-bold text-slate-800 whitespace-nowrap">${log.qty}</td>
                    <td class="p-2.5 text-slate-600">${log.detail}</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;

    } catch (err) {
        console.error('Load Activity Logs Error:', err);
        tableBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
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
        if (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN') await loadActivityLogs();
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
        if (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN') await loadActivityLogs();
    }
});

// -------------------------------------------------------------
// 🩺 5. ฟังก์ชันฝั่งคลังย่อย (Distribute & Return)
// -------------------------------------------------------------
document.getElementById('recipientSelect')?.addEventListener('change', (e) => {
    const otherInput = document.getElementById('recipientOtherInput');
    if (!otherInput) return;

    if (e.target.value === 'OTHER') {
        otherInput.classList.remove('hidden');
        otherInput.focus();
    } else {
        otherInput.classList.add('hidden');
        otherInput.value = '';
    }
});

document.getElementById('btnDistribute')?.addEventListener('click', async () => {
    const recipientSelect = document.getElementById('recipientSelect');
    const recipientOtherInput = document.getElementById('recipientOtherInput');
    const qtyInput = document.getElementById('distributeQty');
    
    const selectedValue = recipientSelect ? recipientSelect.value : '';
    const otherText = recipientOtherInput ? recipientOtherInput.value.trim() : '';
    const qty = parseInt(qtyInput ? qtyInput.value : '0');

    let recipient = '';
    if (selectedValue === 'OTHER') {
        if (!otherText) {
            return toastWarning('กรุณากรอกข้อมูล', 'โปรดระบุชื่อผู้รับในช่องอื่นๆ');
        }
        recipient = otherText;
    } else {
        recipient = selectedValue;
    }

    if (!recipient) return toastWarning('กรุณากรอกข้อมูล', 'โปรดเลือกผู้รับเวชภัณฑ์');
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

        await loadStockData();
        if (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN') await loadActivityLogs();
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
        if (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN') await loadActivityLogs();
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
        if (CURRENT_USER.role === 'SUPER_ADMIN' || CURRENT_USER.role === 'ADMIN') await loadActivityLogs();
    }
});

document.getElementById('btnRefreshLogs')?.addEventListener('click', async () => {
    await loadActivityLogs();
    toastSuccess('อัปเดตข้อมูลสำเร็จ 🔄', 'ดึงข้อมูลกิจกรรมล่าสุดเรียบร้อยแล้ว');
});

// -------------------------------------------------------------
// 📊 7.1 Export Excel Report (พร้อมระบบล็อคปุ่มป้องกันกดซ้ำ)
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
        // 🛑 🔒 1. ล็อคปุ่มทันทีเพื่อป้องกันการกดย้ำ
        btnExcel.disabled = true;
        btnExcel.classList.add('opacity-50', 'cursor-not-allowed');
        btnExcel.innerHTML = `<span>⏳ กำลังสร้าง Excel...</span>`;

        const startDate = document.getElementById('exportStartDate')?.value;
        const endDate = document.getElementById('exportEndDate')?.value;

        const { data: profiles } = await supabase.from('profiles').select('id, full_name, staff_code');
        const userMap = {};
        (profiles || []).forEach(p => {
            userMap[p.id] = p.full_name ? `${p.full_name} (${p.staff_code || '-'})` : 'ไม่ระบุชื่อ';
        });

        const workbook = XLSX.utils.book_new();

        const createSheetWithWidth = (dataList) => {
            const sheet = XLSX.utils.json_to_sheet(dataList.length ? dataList : [{'ข้อความ': 'ไม่มีข้อมูล'}]);
            if (dataList.length > 0) {
                const colWidths = [];
                Object.keys(dataList[0]).forEach(key => {
                    let maxLen = key.toString().length;
                    dataList.forEach(row => {
                        const val = row[key] ? row[key].toString() : '';
                        if (val.length > maxLen) maxLen = val.length;
                    });
                    colWidths.push({ wch: Math.max(maxLen + 5, 18) });
                });
                sheet['!cols'] = colWidths;
            }
            return sheet;
        };

        if (isRestockChecked) {
            let query = supabase.from('stock_transactions').select('*').eq('type', 'RESTOCK').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: restockList } = await query;
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
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(restockData), "1. เติมเข้าคลังใหญ่");
        }

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
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(transferData), "2. จ่าย-คืน คลังย่อย");
        }

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
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(distributeData), "3. ประวัติการแจกใช้งาน");
        }

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
            XLSX.utils.book_append_sheet(workbook, createSheetWithWidth(auditData), "4. สรุปยอดนับประจำเวร");
        }

        const dateStr = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `D-Stock_ER_Report_${dateStr}.xlsx`);
        
        toastSuccess('ส่งออก Excel สำเร็จ 📥', 'ดาวน์โหลดไฟล์ Excel สรุปข้อมูลเรียบร้อยแล้ว');

    } catch (err) {
        console.error('Export Excel Error:', err);
        toastError('เกิดข้อผิดพลาดในการดึงรายงาน', err.message);
    } finally {
        // 🔓 2. ปลดล็อคปุ่มคืนค่าเดิมเสมอไม่ว่าจะสำเร็จหรือเกิด Error
        btnExcel.disabled = false;
        btnExcel.classList.remove('opacity-50', 'cursor-not-allowed');
        btnExcel.innerHTML = originalText;
    }
});

// -------------------------------------------------------------
// 📄 7.2 Export PDF Executive Report (พร้อมระบบล็อคปุ่มป้องกันกดซ้ำ)
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

    const btnPDF = document.getElementById('btnExportPDF');
    const originalText = btnPDF.innerHTML;

    try {
        // 🛑 🔒 1. ล็อคปุ่มทันทีเพื่อป้องกันการกดย้ำ
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

        const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, full_name, staff_code');
        if (profErr) console.warn('Profiles Query Warning:', profErr.message);

        const userMap = {};
        (profiles || []).forEach(p => {
            userMap[p.id] = p.full_name ? `${p.full_name} (${p.staff_code || '-'})` : 'ไม่ระบุชื่อ';
        });

        if (typeof html2pdf === 'undefined') {
            Swal.close();
            return toastError('ไม่พบการอ้างอิงไฟล์ PDF', 'กรุณาตรวจสอบ CDN ของ html2pdf ในหน้าเว็บ');
        }

        const printContainer = document.createElement('div');
        printContainer.style.fontFamily = "'THSarabunNew', 'Prompt', sans-serif";
        printContainer.style.color = "#1e293b";
        printContainer.style.backgroundColor = "#ffffff";
        printContainer.style.margin = "0";
        printContainer.style.padding = "0";

        let isFirstPage = true;

        const buildTableHTML = (titleText, headers, rowsData) => {
            const pageBreakStyle = !isFirstPage 
                ? 'style="page-break-before: always; margin-top: 0 !important; padding-top: 0 !important;"' 
                : 'style="margin-top: 0 !important; padding-top: 0 !important;"';
            isFirstPage = false;

            let rowsHTML = '';
            if (rowsData.length > 0) {
                rowsData.forEach(row => {
                    rowsHTML += `<tr style="border-bottom: 1px solid #cbd5e1;">`;
                    row.forEach(cell => {
                        rowsHTML += `<td style="padding: 4px 8px; font-size: 15px;">${cell}</td>`;
                    });
                    rowsHTML += `</tr>`;
                });
            } else {
                rowsHTML = `<tr><td colspan="${headers.length}" style="text-align: center; padding: 8px; font-size: 15px; color: #64748b;">ไม่มีข้อมูล</td></tr>`;
            }

            let headerHTML = '';
            headers.forEach(h => {
                headerHTML += `<th style="padding: 6px 8px; font-size: 16px; font-weight: bold; text-align: left; background-color: #1e293b; color: #ffffff;">${h}</th>`;
            });

            return `
                <div class="pdf-section" ${pageBreakStyle}>
                    <div style="margin-top: 0; margin-bottom: 6px; border-bottom: 2px solid #0284c7; padding-bottom: 4px;">
                        <h2 style="font-size: 20px; font-weight: bold; margin: 0; padding: 0; color: #0f172a; line-height: 1.2;">รายงาน D-Stock ER: ${titleText}</h2>
                        <p style="font-size: 13px; color: #475569; margin: 2px 0 0 0; padding: 0;">ช่วงวันที่: ${startDate || 'ทั้งหมด'} ถึง ${endDate || 'ปัจจุบัน'} | ผู้พิมพ์: ${CURRENT_USER.full_name || 'Super Admin'}</p>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                        <thead>
                            <tr>${headerHTML}</tr>
                        </thead>
                        <tbody>
                            ${rowsHTML}
                        </tbody>
                    </table>
                </div>
            `;
        };

        let fullHTML = '';

        if (isRestockChecked) {
            let query = supabase.from('stock_transactions').select('*').eq('type', 'RESTOCK').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: list } = await query;
            const filtered = (list || []).filter(t => !(t.note || '').includes('ปรับยอดจากการนับ') && !(t.note || '').includes('Diff:'));
            const rows = filtered.map(t => [
                new Date(t.created_at).toLocaleString('th-TH'),
                t.to_user_id && userMap[t.to_user_id] ? userMap[t.to_user_id] : (t.from_user_id && userMap[t.from_user_id] ? userMap[t.from_user_id] : 'ระบบ / Admin'),
                `${t.quantity} Set`,
                t.note || '-'
            ]);
            fullHTML += buildTableHTML("1. รายงานการเติมเข้าคลังใหญ่", ['วันที่-เวลา', 'ผู้ดำเนินการ', 'จำนวน', 'หมายเหตุ'], rows);
        }

        if (isTransferChecked) {
            let query = supabase.from('stock_transactions').select('*').in('type', ['ISSUE', 'RETURN']).order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: list } = await query;
            const rows = (list || []).map(t => [
                new Date(t.created_at).toLocaleString('th-TH'),
                t.type === 'ISSUE' ? 'จ่ายให้คลังย่อย' : 'ส่งคืนคลังใหญ่',
                t.to_user_id && userMap[t.to_user_id] ? userMap[t.to_user_id] : (t.from_user_id && userMap[t.from_user_id] ? userMap[t.from_user_id] : 'ผู้ใช้งานระบบ'),
                `${t.quantity} Set`
            ]);
            fullHTML += buildTableHTML("2. รายงานการจ่าย-คืน คลังย่อย", ['วันที่-เวลา', 'การดำเนินการ', 'ผู้รับ/ผู้ส่งคืน', 'จำนวน'], rows);
        }

        if (isDistributeChecked) {
            let query = supabase.from('distribution_logs').select('*').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: list } = await query;
            const rows = (list || []).map(d => [
                new Date(d.created_at).toLocaleString('th-TH'),
                d.distributor_id && userMap[d.distributor_id] ? userMap[d.distributor_id] : 'ผู้ใช้งานระบบ',
                (d.recipient_info || d.note || '-').replace(/^แจกให้:\s*/, ''),
                `${d.quantity} Set`
            ]);
            fullHTML += buildTableHTML("3. ประวัติการแจกใช้งาน", ['วันที่-เวลา', 'ผู้แจก (Staff)', 'ผู้รับเวชภัณฑ์', 'จำนวนที่แจก'], rows);
        }

        if (isAuditChecked) {
            let query = supabase.from('daily_stock_counts').select('*').order('created_at', { ascending: false });
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

            const { data: list } = await query;
            const rows = (list || []).map(a => [
                new Date(a.created_at || a.count_date).toLocaleString('th-TH'),
                a.counted_by && userMap[a.counted_by] ? userMap[a.counted_by] : 'ผู้ใช้งานระบบ',
                `${a.actual_qty ?? 0} Set`,
                a.note || '-'
            ]);
            fullHTML += buildTableHTML("4. สรุปยอดนับประจำเวร", ['วันที่-เวลา ตรวจนับ', 'ผู้ตรวจนับ (Staff)', 'นับได้จริง', 'หมายเหตุ'], rows);
        }

        printContainer.innerHTML = fullHTML;

        const dateStr = (startDate && endDate) ? `${startDate}_to_${endDate}` : new Date().toISOString().slice(0, 10);
        
        const opt = {
            margin:       [2, 6, 6, 6],
            filename:     `D-Stock_ER_Report_${dateStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        await html2pdf().set(opt).from(printContainer).save();
        
        Swal.close();
        toastSuccess('ส่งออก PDF สำเร็จ 📄', 'ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว');

    } catch (err) {
        Swal.close();
        console.error('Export PDF Error:', err);
        toastError('เกิดข้อผิดพลาดในการสร้าง PDF', err.message || 'โปรดลองใหม่อีกครั้ง');
    } finally {
        // 🔓 2. ปลดล็อคปุ่มคืนค่าเดิมเสมอไม่ว่าจะสำเร็จหรือเกิด Error
        btnPDF.disabled = false;
        btnPDF.classList.remove('opacity-50', 'cursor-not-allowed');
        btnPDF.innerHTML = originalText;
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
