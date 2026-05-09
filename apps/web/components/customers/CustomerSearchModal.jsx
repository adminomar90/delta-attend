'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { customerStatusLabelMap, pickPlanCustomerSnapshot } from '../../lib/customers';

export default function CustomerSearchModal({ open, onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedSiteByCustomer, setSelectedSiteByCustomer] = useState({});
  const [loading, setLoading] = useState(false);
  const query = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get(`/customers${query ? `?search=${encodeURIComponent(query)}` : ''}`);
        setCustomers(response.customers || []);
      } catch {
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  if (!open) return null;

  const chooseCustomer = (customer) => {
    const siteId = selectedSiteByCustomer[customer._id || customer.id] || '';
    const site = (customer.sites || []).find((item) => String(item._id || item.id) === String(siteId)) || null;
    onSelect(pickPlanCustomerSnapshot(customer, site), customer, site);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel customer-search-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>بحث في الزبائن</h3>
            <p className="daily-plan-modal-subtitle">البحث حسب الاسم، الهاتف، العنوان، المحافظة، أو الموقع.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <input
          className="input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="اكتب اسم الزبون أو رقم الهاتف أو المحافظة..."
          autoFocus
        />

        <div className="customer-search-results">
          {loading ? <p className="maintenance-empty">جارٍ البحث...</p> : null}
          {!loading && !customers.length ? <p className="maintenance-empty">لا توجد نتائج مطابقة.</p> : null}
          {customers.map((customer) => {
            const customerId = customer._id || customer.id;
            return (
              <article className="customer-result-card" key={customerId}>
                <div>
                  <strong>{customer.name}</strong>
                  <div className="daily-plan-card-subtitle">
                    {customer.phone || '-'} - {customer.province || '-'} - {customerStatusLabelMap[customer.status] || customer.status || '-'}
                  </div>
                  <div className="daily-plan-card-subtitle">{customer.address || 'بدون عنوان'}</div>
                </div>
                {customer.sites?.length ? (
                  <select
                    className="select"
                    value={selectedSiteByCustomer[customerId] || ''}
                    onChange={(event) => setSelectedSiteByCustomer((prev) => ({ ...prev, [customerId]: event.target.value }))}
                  >
                    <option value="">الموقع الرئيسي</option>
                    {customer.sites.map((site) => (
                      <option key={site._id || site.id} value={site._id || site.id}>
                        {site.name || site.address || 'فرع'}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" className="btn btn-primary btn-sm" onClick={() => chooseCustomer(customer)}>اختيار</button>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
