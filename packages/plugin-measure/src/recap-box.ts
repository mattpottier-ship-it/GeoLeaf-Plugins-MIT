/*!
 * @geoleaf-plugins/measure — Recap box (measurement summary table)
 * © 2026 Mattieu Pottier — MIT License
 *
 * Sprint 2: table rows for each vertex/segment, footer with perimeter + optional area.
 */
import { _el, _getLabel } from "./internal.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One row in the recap table: a segment from vertex n-1 to n. */
export interface RecapRow {
    /** Segment index (1-based). */
    index: number;
    /** Formatted coordinate string, e.g. "2.3501, 48.8502". */
    coordStr: string;
    /** Formatted segment length, e.g. "124 m". */
    lengthStr: string;
}

/** Footer row summarising the complete measurement. */
export interface RecapTotal {
    /** Total perimeter / cumulative distance string. */
    perimeterStr: string;
    /** Optional area string (only for closed polygon measurements). */
    areaStr?: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _recapEl: HTMLElement | null = null;
let _tbody: HTMLTableSectionElement | null = null;
let _tfoot: HTMLTableSectionElement | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates the recap box DOM and appends it to the given container.
 * Called once from floating-menu._buildDOM.
 */
export function initRecapBox(container: HTMLElement): void {
    _recapEl = _el("div", "gl-measure-recap gl-measure-recap--hidden");

    const table = _el("table", "gl-measure-recap__table");

    // Table header
    const thead = table.createTHead();
    const headRow = thead.insertRow();
    const thIndex = document.createElement("th");
    thIndex.textContent = _getLabel("measure.recap.header.index");
    const thCoord = document.createElement("th");
    thCoord.textContent = _getLabel("measure.recap.header.coord");
    const thLength = document.createElement("th");
    thLength.textContent = _getLabel("measure.recap.header.length");
    headRow.appendChild(thIndex);
    headRow.appendChild(thCoord);
    headRow.appendChild(thLength);

    // Table body (rows filled by renderRecap)
    _tbody = table.createTBody();

    // Table footer (total row)
    _tfoot = table.createTFoot();

    _recapEl.appendChild(table);
    container.appendChild(_recapEl);
}

/**
 * Renders the given rows and total in the recap table and makes it visible.
 * All text is inserted via textContent — never innerHTML.
 */
export function renderRecap(rows: RecapRow[], total: RecapTotal): void {
    if (!_tbody || !_tfoot || !_recapEl) return;

    // Rebuild body rows
    _tbody.textContent = "";
    for (const row of rows) {
        const tr = _tbody.insertRow();
        const tdIdx = tr.insertCell();
        tdIdx.textContent = String(row.index);
        const tdCoord = tr.insertCell();
        tdCoord.textContent = row.coordStr;
        const tdLen = tr.insertCell();
        tdLen.textContent = row.lengthStr;
    }

    // Rebuild footer
    _tfoot.textContent = "";
    const footRow = _tfoot.insertRow();
    footRow.className = "gl-measure-recap__total";
    const tdLabel = footRow.insertCell();
    tdLabel.colSpan = 2;
    tdLabel.textContent = _getLabel("measure.recap.total");
    const tdPerim = footRow.insertCell();
    tdPerim.textContent = total.areaStr
        ? `${total.perimeterStr} — ${total.areaStr}`
        : total.perimeterStr;

    _recapEl.classList.remove("gl-measure-recap--hidden");
}

/** Hides the recap box and empties its rows. */
export function clearRecap(): void {
    if (!_tbody || !_tfoot || !_recapEl) return;
    _tbody.textContent = "";
    _tfoot.textContent = "";
    _recapEl.classList.add("gl-measure-recap--hidden");
}
