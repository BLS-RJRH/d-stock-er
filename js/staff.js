import { supabase } from './supabaseClient.js';

// 1. ดึงรายชื่อ Staff ทั้งหมดมาแสดง
async function loadStaffList() {
    const tbody = document.getElementById('staffTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">กำลังโหลดข้อมูล...</td></tr>';

    const { data: staffList, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
        return;
    }

    if (!staffList || staffList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">ยังไม่มีรายชื่อ Staff ในระบบ</td></tr>';
        return;
    }

    const roleBadges = {
        'CENTRAL_ADMIN': '<span class="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded-full font-medium">📦 Admin คลังใหญ่</span>',
        'SUB_STAFF': '<span class="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-medium">🩺 Staff คลังย่อย</span>',
        'SUPER_ADMIN': '<span class="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">👑 Super Admin</span>'
    };

    tbody.innerHTML = staffList.map(item => `
        <tr class="border-b hover:bg-slate-50 transition">
            <td class="px-4 py-3 font-medium text-slate-800">${item.staff_code || '-'}</td>
            <td class="px-4 py-3 font-semibold text-slate-700">${item.full_name || 'ไม่ระบุชื่อ'}</td>
            <td class="px-4 py-3">${roleBadges[item.role] || item.role}</td>
            <td class="px-4 py-3 text-xs text-slate-400 font-mono">${item.id}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="deleteStaff('${item.id}')" class="text-xs text-red-600 hover:text-red-800 font-medium">ลบ</button>
            </td>
        </tr>
    `).join('');
}

// 2. บันทึก Staff ใหม่
document.getElementById('staffForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const staffCode = document.getElementById('staffCode').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const role = document.getElementById('staffRole').value;

    // สุ่ม UUID สำหรับ Test Mode
    const newUuid = crypto.randomUUID();

    const { error } = await supabase.from('profiles').insert([{
        id: newUuid,
        staff_code: staffCode,
        full_name: fullName,
        role: role
    }]);

    if (error) {
        alert('เกิดข้อผิดพลาดในการเพิ่ม Staff: ' + error.message);
    } else {
        alert(`เพิ่ม Staff "${fullName}" สำเร็จ!`);
        document.getElementById('staffForm').reset();
        loadStaffList();
    }
});

// 3. ฟังก์ชันลบ Staff
window.deleteStaff = async function(id) {
    if (!confirm('คุณต้องการลบรายชื่อ Staff นี้ใช่หรือไม่?')) return;

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
        alert('เกิดข้อผิดพลาดในการลบ: ' + error.message);
    } else {
        loadStaffList();
    }
};

// โหลดรายชื่อเมื่อเปิดหน้าเว็บ
loadStaffList();
