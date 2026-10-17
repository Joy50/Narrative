export function listResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export function listCount(data, fallback = 0) {
  if (typeof data?.count === 'number') return data.count;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data?.results)) return data.results.length;
  return fallback;
}

export function pageSlice(items, page, pageSize) {
  const start = (Math.max(page, 1) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export default function PaginationBar({
  page,
  pageSize = 10,
  count = 0,
  onPage,
  onPageSize,
  sizes = [10, 20, 50],
}) {
  const pages = Math.max(1, Math.ceil((count || 0) / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const from = count ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, count);
  if (!count) return null;

  const windowStart = Math.max(1, safePage - 2);
  const windowEnd = Math.min(pages, windowStart + 4);
  const numbers = [];
  for (let n = windowStart; n <= windowEnd; n += 1) numbers.push(n);

  return (
    <div className="pagination-bar">
      <div className="stat-mini">{from}–{to} of {count}</div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {onPageSize && (
          <select
            className="form-select form-select-sm pagination-size"
            value={pageSize}
            onChange={(event) => {
              onPageSize(Number(event.target.value));
              onPage(1);
            }}
          >
            {sizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        )}
        <button type="button" className="btn btn-outline-soft btn-sm" disabled={safePage <= 1} onClick={() => onPage(safePage - 1)}>Prev</button>
        {numbers.map((n) => (
          <button
            type="button"
            key={n}
            className={`btn btn-sm ${n === safePage ? 'btn-primary-soft' : 'btn-outline-soft'}`}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ))}
        <button type="button" className="btn btn-outline-soft btn-sm" disabled={safePage >= pages} onClick={() => onPage(safePage + 1)}>Next</button>
      </div>
    </div>
  );
}
