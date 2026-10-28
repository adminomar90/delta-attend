export const normalizeNetworkSearch = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/\s+/g, ' ').trim();
export const filterNetworkCustomers = (customers, { search = '', contractStatus = '' } = {}) => {
  const words = normalizeNetworkSearch(search).split(' ').filter(Boolean);
  return customers.filter((customer) => {
    if (contractStatus && customer.contractStatus !== contractStatus) return false;
    const text = normalizeNetworkSearch([customer.name, ...(customer.branches || []).flatMap((branch) => [branch.name, branch.city, branch.address])].join(' '));
    return words.every((word) => text.includes(word));
  });
};
