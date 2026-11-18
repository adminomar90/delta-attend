'use client';

import { useEffect, useState } from 'react';
import { companyContact } from '../../../../../shared/companyContact.mjs';
import { api } from '../../../lib/api';
import { formatBadgeDate } from '../../../lib/employeeBadgeCard.mjs';
import { normalizeWhatsappPhone } from '../../../lib/whatsapp';

const statuses = {
  loading: { label: 'جارٍ التحقق…', tone: 'neutral', symbol: '…' },
  active: { label: 'الهوية سارية المفعول', tone: 'valid', symbol: '✓' },
  expired: { label: 'الهوية منتهية الصلاحية', tone: 'invalid', symbol: '!' },
  inactive: { label: 'الهوية موقوفة', tone: 'invalid', symbol: '×' },
  invalid: { label: 'رمز التحقق غير صالح', tone: 'invalid', symbol: '×' },
  pending: { label: 'لم تبدأ صلاحية الهوية بعد', tone: 'neutral', symbol: '–' },
  unavailable: { label: 'تعذّر التحقق من الهوية. حاول مرة أخرى.', tone: 'neutral', symbol: '!' },
};

function IdentityDetails({ result }) {
  return (
    <>
      <div className="digital-id-profile">
        {result.photo && <img className="digital-id-portrait" src={result.photo} width="548" height="528" alt="صورة الموظف" />}
        <div className="digital-id-name">
          {result.title && <p className="digital-id-template">{result.title}</p>}
          <h2>{result.employee.fullName}</h2>
          {result.nameEn && <p className="digital-id-name-en" lang="en"><bdi>{result.nameEn}</bdi></p>}
          <p className="digital-id-job">{result.employee.jobTitle}</p>
          {result.jobEn && <p className="digital-id-job-en" lang="en"><bdi>{result.jobEn}</bdi></p>}
        </div>
      </div>
      <dl className="digital-id-metadata">
        <div><dt>رقم الموظف</dt><dd><bdi>{result.employee.employeeCode}</bdi></dd></div>
        <div><dt>تاريخ الإصدار</dt><dd><bdi className="digital-id-date">{formatBadgeDate(result.issuedOn).replaceAll(' ', '')}</bdi></dd></div>
        <div><dt>تاريخ الانتهاء</dt><dd><bdi className="digital-id-date">{formatBadgeDate(result.expiresOn).replaceAll(' ', '')}</bdi></dd></div>
      </dl>
    </>
  );
}

function CompanyLinks() {
  const phone = normalizeWhatsappPhone(companyContact.primaryPhone);
  return (
    <footer className="digital-id-company">
      <h2>تواصل مع دلتا بلص</h2>
      <div className="digital-id-contact-actions">
        <a className="digital-id-link digital-id-link-whatsapp" href={`https://wa.me/${phone}`}
          target="_blank" rel="noopener noreferrer">مراسلة واتساب</a>
        <a className="digital-id-link digital-id-link-call" href={`tel:+${phone}`}>اتصل بالشركة</a>
      </div>
      <div className="digital-id-company-links">
        <a className="digital-id-link" href={companyContact.websiteUrl} target="_blank" rel="noopener noreferrer">الموقع الرسمي</a>
        <a className="digital-id-link" href={companyContact.instagramUrl} target="_blank" rel="noopener noreferrer">متابعة إنستغرام</a>
        <a className="digital-id-link" href={companyContact.facebookUrl} target="_blank" rel="noopener noreferrer">متابعة فيسبوك</a>
      </div>
    </footer>
  );
}

export default function EmployeeBadgeVerification({ token }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    let request = 0;
    const verify = () => {
      const version = ++request;
      setResult(null);
      api.post('/employee-badges/verify', { token })
        .then((data) => { if (version === request) setResult(data); })
        .catch(() => { if (version === request) setResult({ status: 'unavailable' }); });
    };
    const onRestore = (event) => { if (event.persisted) verify(); };
    verify();
    window.addEventListener('pageshow', onRestore);
    return () => {
      request += 1;
      window.removeEventListener('pageshow', onRestore);
    };
  }, [token]);

  const status = result ? statuses[result.status] || statuses.unavailable : statuses.loading;
  const showDetails = result?.employee && (result.status === 'active' || result.status === 'expired');

  return (
    <main dir="rtl" className="digital-id-page">
      <article className="digital-id" aria-labelledby="digital-id-title">
        <img className="digital-id-brand" src="/brand/employee-badge-header.png"
          alt="دلتا بلص للحلول التقنية" width="638" height="239" />
        <div className="digital-id-body">
          <h1 id="digital-id-title">الهوية الرقمية للموظف</h1>
          <div role="status" className={`digital-id-status digital-id-status-${status.tone}`}>
            <span className="digital-id-status-icon" aria-hidden="true">{status.symbol}</span>
            <span>{status.label}</span>
          </div>
          {showDetails && <IdentityDetails result={result} />}
          <CompanyLinks />
        </div>
      </article>
    </main>
  );
}
