/**
 * Tests for recap-box.ts — Sprint 2
 * Covers: initRecapBox, renderRecap, clearRecap, XSS safety.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initRecapBox, renderRecap, clearRecap } from "../recap-box.js";
import { installMockGeoLeaf, uninstallMockGeoLeaf } from "./setup.js";

describe("recap-box", () => {
    let container: HTMLElement;

    beforeEach(() => {
        installMockGeoLeaf();
        container = document.createElement("div");
        document.body.appendChild(container);
        initRecapBox(container);
    });

    afterEach(() => {
        container.remove();
        uninstallMockGeoLeaf();
    });

    // -------------------------------------------------------------------------
    // initRecapBox
    // -------------------------------------------------------------------------

    it("creates .gl-measure-recap inside the given container", () => {
        expect(container.querySelector(".gl-measure-recap")).not.toBeNull();
    });

    it("recap box is initially hidden", () => {
        const recap = container.querySelector(".gl-measure-recap")!;
        expect(recap.classList.contains("gl-measure-recap--hidden")).toBe(true);
    });

    it("creates a table with thead", () => {
        expect(container.querySelector(".gl-measure-recap__table thead")).not.toBeNull();
    });

    // -------------------------------------------------------------------------
    // renderRecap
    // -------------------------------------------------------------------------

    it("renderRecap shows the recap box", () => {
        renderRecap([{ index: 1, coordStr: "2.35, 48.85", lengthStr: "100 m" }], { perimeterStr: "100 m" });
        const recap = container.querySelector(".gl-measure-recap")!;
        expect(recap.classList.contains("gl-measure-recap--hidden")).toBe(false);
    });

    it("renderRecap creates one tbody row per RecapRow", () => {
        renderRecap(
            [
                { index: 1, coordStr: "2.35, 48.85", lengthStr: "86 m" },
                { index: 2, coordStr: "2.36, 48.86", lengthStr: "142 m" },
                { index: 3, coordStr: "2.37, 48.87", lengthStr: "53 m" },
            ],
            { perimeterStr: "281 m" }
        );
        const rows = container.querySelectorAll(".gl-measure-recap__table tbody tr");
        expect(rows.length).toBe(3);
    });

    it("renderRecap sets correct cell text values", () => {
        renderRecap([{ index: 1, coordStr: "2.35, 48.85", lengthStr: "86 m" }], { perimeterStr: "86 m" });
        const cells = container.querySelectorAll(".gl-measure-recap__table tbody tr:first-child td");
        expect(cells[0].textContent).toBe("1");
        expect(cells[1].textContent).toBe("2.35, 48.85");
        expect(cells[2].textContent).toBe("86 m");
    });

    it("renderRecap shows perimeter in tfoot", () => {
        renderRecap([{ index: 1, coordStr: "2.35, 48.85", lengthStr: "86 m" }], { perimeterStr: "86 m" });
        const tfoot = container.querySelector(".gl-measure-recap__table tfoot");
        expect(tfoot!.textContent).toContain("86 m");
    });

    it("renderRecap includes area string in tfoot when provided", () => {
        renderRecap(
            [{ index: 1, coordStr: "2.35, 48.85", lengthStr: "86 m" }],
            { perimeterStr: "268 m", areaStr: "0.42 ha" }
        );
        const tfoot = container.querySelector(".gl-measure-recap__table tfoot");
        expect(tfoot!.textContent).toContain("268 m");
        expect(tfoot!.textContent).toContain("0.42 ha");
    });

    it("calling renderRecap twice replaces previous rows", () => {
        renderRecap([{ index: 1, coordStr: "A", lengthStr: "10 m" }], { perimeterStr: "10 m" });
        renderRecap(
            [
                { index: 1, coordStr: "B", lengthStr: "20 m" },
                { index: 2, coordStr: "C", lengthStr: "30 m" },
            ],
            { perimeterStr: "50 m" }
        );
        const rows = container.querySelectorAll(".gl-measure-recap__table tbody tr");
        expect(rows.length).toBe(2);
        expect(rows[0].querySelector("td")!.textContent).toBe("1");
    });

    // -------------------------------------------------------------------------
    // clearRecap
    // -------------------------------------------------------------------------

    it("clearRecap hides the recap box", () => {
        renderRecap([{ index: 1, coordStr: "2.35, 48.85", lengthStr: "100 m" }], { perimeterStr: "100 m" });
        clearRecap();
        const recap = container.querySelector(".gl-measure-recap")!;
        expect(recap.classList.contains("gl-measure-recap--hidden")).toBe(true);
    });

    it("clearRecap empties tbody rows", () => {
        renderRecap([{ index: 1, coordStr: "2.35, 48.85", lengthStr: "100 m" }], { perimeterStr: "100 m" });
        clearRecap();
        const rows = container.querySelectorAll(".gl-measure-recap__table tbody tr");
        expect(rows.length).toBe(0);
    });

    // -------------------------------------------------------------------------
    // XSS safety
    // -------------------------------------------------------------------------

    it("does not interpret HTML in coordStr (XSS safety)", () => {
        const xss = '<img src=x onerror="window.__xss=1">';
        renderRecap([{ index: 1, coordStr: xss, lengthStr: "10 m" }], { perimeterStr: "10 m" });
        const cell = container.querySelector<HTMLElement>(".gl-measure-recap__table tbody td:nth-child(2)")!;
        // textContent should contain the literal string, no img element
        expect(cell.textContent).toBe(xss);
        expect(container.querySelector("img")).toBeNull();
        expect((globalThis as any).__xss).toBeUndefined();
    });
});
