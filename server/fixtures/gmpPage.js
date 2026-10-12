// A trimmed copy of the structure of InvestorGain's IPO GMP report table (rows are synthetic, markup is the real shape).
const cell = (label, inner) => `<td style="text-align:left" data-label="${label}" class=""><div class="report-td "><div class="mono-num">${inner}</div></div></td>`;
const name = (n, slug, id, badges, extra = '') => cell('Name', `<a href="/gmp/${slug}/${id}/" title="${n}" target="_parent">${n}</a> ${badges}${extra}`);
const upcomingBadge = '<span class="badge rounded-pill bg-secondar">IPO</span><span class="badge rounded-pill bg-warning ">U</span>';

export const row = ({ n, slug, id, upcoming = true, badges = upcoming ? upcomingBadge : '<span class="badge rounded-pill bg-secondar">IPO</span>', extra = '', gmp = '&#8377;<b>86</b> (31.73%)<br><small><b>63 ↓ / 86 ↑</b></small>', sub = '-', price = '271', size = '₹499.2 Cr', lot = '55', open = '13-Oct', close = '15-Oct', boa = '16-Oct', listing = '21-Oct', updated = '12-Oct 23:37', anchor = '✅' }) => `<tr>${[
  name(n, slug, id, badges, extra), cell('GMP', gmp), cell('Rating', '🔥🔥🔥'), cell('Sub', sub), cell('Price (₹)', price), cell('IPO Size', size), cell('Lot', lot),
  cell('Open', open), cell('Close', close), cell('BoA Dt', boa), cell('Listing', listing), cell('Updated-On', `<small><b>${updated}</b></small>`), cell('Anchor', anchor),
].join('')}</tr>`;

export const page = (rows) => `<html><body><table class="report-data-table" id="reportTable"><thead><tr><th>Name</th></tr></thead><tbody>${rows.join('')}</tbody></table></body></html>`;

export const FIXTURE_ROWS = [
  row({ n: 'HD Fire Protect', slug: 'hd-fire-protect-ipo', id: 2400 }),
  row({ n: 'Tonbo Imaging India', slug: 'tonbo-imaging-india-ipo', id: 2369, gmp: '&#8377;<b>425</b> (60.71%)<br><small><b>270 ↓ / 425 ↑</b></small>', price: '700', size: '₹852.18 Cr', lot: '21', open: '15-Oct', close: '19-Oct', boa: '21-Oct', listing: '23-Oct' }),
  row({ n: 'Jio Platforms', slug: 'jio-platforms-ipo', id: 2306, gmp: '&#8377;<b>182</b> (-%)<br><small><b>148 ↓ / 182 ↑</b></small>', price: '0', size: '-', lot: '', open: '', close: '', boa: '', listing: '' }),
  row({ n: 'Shellz India', slug: 'shellz-india-ipo', id: 2228, badges: '<span class="badge rounded-pill bg-secondar">BSE SME</span><span class="badge rounded-pill bg-warning ">U</span>', gmp: '&#8377;<b>--</b> (0.00%)<br><small><b>0 ↓ / 0 ↑</b></small>', price: '179', open: '15-Oct', close: '19-Oct' }),
  row({
    n: 'Orient Cables', slug: 'orient-cables-ipo', id: 1832, badges: '<span class="badge rounded-pill bg-secondar">IPO</span>',
    extra: "<span class='text-success d-inline ms-2'><small ><b>L@450 (65.44%)</b></small></span>", gmp: '&#8377;<b>110</b> (40.44%)<br><small><b>34 ↓ / 123 ↑</b></small>',
    sub: '97.28x', price: '272', open: '25-Sep<br><small><b>GMP: 80</b></small>', close: '29-Sep', boa: '30-Sep', listing: '5-Oct', updated: '5-Oct 9:37',
  }),
  row({
    n: 'Acevector', slug: 'acevector-ipo', id: 1900, badges: '<span class="badge rounded-pill bg-secondar">IPO</span>',
    extra: "<span class='text-danger d-inline ms-2'><small ><b>[email protected] (-11.5%)</b></small></span>", gmp: '&#8377;<b>--</b> (0.00%)<br><small><b>0 ↓ / 2 ↑</b></small>',
    sub: '5.07x', price: '32', open: '25-Sep', close: '29-Sep', boa: '30-Sep', listing: '5-Oct', updated: '5-Oct 9:37',
  }),
];
export const FIXTURE_HTML = page(FIXTURE_ROWS);
