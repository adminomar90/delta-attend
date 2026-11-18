const knownNames = new Map(Object.entries({
  أحمد: 'Ahmed', احمد: 'Ahmed', محمد: 'Mohammed', محمود: 'Mahmoud', علي: 'Ali',
  حسين: 'Hussein', حسن: 'Hassan', سعد: 'Saad', الأمين: 'Alameen', الامين: 'Alameen',
  عمر: 'Omar', عبد: 'Abd', الله: 'Allah', عبدالله: 'Abdullah', عبدالعزيز: 'Abdulaziz',
  مصطفى: 'Mustafa', زيد: 'Zaid', خالد: 'Khalid', إبراهيم: 'Ibrahim', ابراهيم: 'Ibrahim',
  يوسف: 'Yusuf', رامي: 'Rami', حيدر: 'Haider', حكم: 'Hakam', فاطمة: 'Fatima',
  زينب: 'Zainab', مريم: 'Maryam', نور: 'Noor', سارة: 'Sara', آية: 'Aya',
}));
const letters = {
  ا: 'a', أ: 'a', إ: 'i', آ: 'aa', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'dh', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't',
  ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h',
  و: 'w', ي: 'y', ى: 'a', ة: 'a', ئ: 'y', ؤ: 'w', ء: '', گ: 'g', چ: 'ch', پ: 'p',
};
const knownJobs = new Map(Object.entries({
  'قائد فريق': 'Team Leader',
  'قائد الفريق': 'Team Leader',
  'مسؤول فريق': 'Team Lead',
  'فني أنظمة تقنية': 'Technical Systems Technician',
  'فني شبكات': 'Network Technician',
  'مهندس شبكات': 'Network Engineer',
  'فني كهرباء': 'Electrical Technician',
  'فني كاميرات': 'CCTV Technician',
  'فني صيانة': 'Maintenance Technician',
  'فني تركيب': 'Installation Technician',
  'دعم فني': 'Technical Support',
  'مهندس': 'Engineer',
  'مدير مشاريع': 'Project Manager',
  'مدير مشروع': 'Project Manager',
  'مدير عام': 'General Manager',
  'مدير مالي': 'Finance Manager',
  'مسؤول الموارد البشرية': 'HR Officer',
  'مدير الموارد البشرية': 'HR Manager',
  'أمين مخزن': 'Warehouse Keeper',
  'موظف خدمات': 'Service Staff',
  'محاسب': 'Accountant',
  'موظف': 'Employee',
}));

const clean = (value) => value.replace(/[\u064b-\u065f\u0670\u0640]/gu, '').trim().replace(/\s+/gu, ' ');

export function suggestBadgeName(name) {
  return clean(name).split(' ').map((word) => {
    if (knownNames.has(word)) return knownNames.get(word);
    const prefix = word.startsWith('ال') && word.length > 3 ? 'Al-' : '';
    const rest = prefix ? word.slice(2) : word;
    if (knownNames.has(rest)) return prefix + knownNames.get(rest);
    const latin = Array.from(rest, (char) => letters[char] ?? (/^[a-z-]$/i.test(char) ? char : '')).join('');
    return prefix + latin.charAt(0).toUpperCase() + latin.slice(1);
  }).join(' ').trim();
}

export function suggestBadgeJob(job) {
  return knownJobs.get(clean(job))
    || (/^[a-z][a-z\s-]*$/i.test(job) ? job : '');
}
