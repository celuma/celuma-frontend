/**
 * Céluma 1.4, #21 — both report-side sample-image upload paths take HEIC and
 * surface the backend's Spanish rejection instead of raw JSON.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "antd";

const uploadReportImage = vi.fn();
vi.mock("../../services/report_service", () => ({
    uploadReportImage: (...args: unknown[]) => uploadReportImage(...args),
    deleteReportImage: vi.fn(),
    fetchReportImages: vi.fn().mockResolvedValue([]),
}));

import ReportImages from "../../components/report/report_images";
import SampleImagesPicker from "../../components/report/sample_images_picker";

const heic = (name = "IMG_0001.HEIC", size = 1024) =>
    new File([new Uint8Array(size)], name, { type: "image/heic" });

function fileInput(container: HTMLElement): HTMLInputElement {
    const input = container.querySelector('input[type="file"]');
    if (!input) throw new Error("no file input");
    return input as HTMLInputElement;
}

async function renderPicker() {
    const view = render(<App><SampleImagesPicker sampleId="s1" selectedIds={[]} onToggleSelect={vi.fn()} /></App>);
    // the dropzone is disabled while the gallery loads
    await waitFor(() => expect(view.container.querySelector(".ant-upload-disabled")).toBeNull());
    return view;
}

beforeEach(() => {
    uploadReportImage.mockReset();
});

describe("SampleImagesPicker", () => {
    it("offers HEIC in the file chooser and uploads it", async () => {
        uploadReportImage.mockResolvedValue({ sample_image_id: "i1" });
        const { container } = await renderPicker();
        expect(fileInput(container).accept).toContain(".heic");

        await userEvent.setup({ applyAccept: false }).upload(fileInput(container), heic());
        await waitFor(() => expect(uploadReportImage).toHaveBeenCalledTimes(1));
        expect(uploadReportImage.mock.calls[0][1].name).toBe("IMG_0001.HEIC");
        expect(await screen.findByText(/subida correctamente/)).toBeInTheDocument();
        expect(screen.queryByText(/Error al subir/)).toBeNull();
    });

    it("shows the server's Spanish reason when the HEIC cannot be converted", async () => {
        uploadReportImage.mockRejectedValue(new Error("No se pudo leer el archivo HEIC: está dañado o incompleto."));
        const { container } = await renderPicker();
        await userEvent.setup({ applyAccept: false }).upload(fileInput(container), heic());
        // visible on screen (antd's static toast API renders nothing on React 19)
        const shown = (await screen.findByText(/está dañado o incompleto/)).textContent ?? "";
        expect(shown).toContain("Error al subir");
        expect(shown).not.toContain("{");
    });

    it("blocks an oversize HEIC before sending it", async () => {
        const { container } = await renderPicker();
        const big = heic("big.heic", 51 * 1024 * 1024);
        await userEvent.setup({ applyAccept: false }).upload(fileInput(container), big);
        expect(await screen.findByText("La imagen excede el límite de 50 MB.")).toBeInTheDocument();
        expect(uploadReportImage).not.toHaveBeenCalled();
    });
});

describe("ReportImages", () => {
    it("accepts HEIC and appends the converted JPEG rendition to the report", async () => {
        uploadReportImage.mockResolvedValue({
            sample_image_id: "i9",
            urls: { processed: "https://cdn.example/p.jpg", thumbnail: "https://cdn.example/t.jpg" },
        });
        const onChange = vi.fn();
        const { container } = render(<App><ReportImages sampleId="s1" value={[]} onChange={onChange} /></App>);
        expect(fileInput(container).accept).toContain(".heif");

        await userEvent.setup({ applyAccept: false }).upload(fileInput(container), heic("scan.heic"));
        await waitFor(() => expect(onChange).toHaveBeenCalled());
        expect(onChange.mock.calls[0][0]).toEqual([
            { id: "i9", url: "https://cdn.example/p.jpg", thumbnailUrl: "https://cdn.example/t.jpg", caption: "" },
        ]);
        expect(screen.getByText(/HEIC hasta 50MB/)).toBeInTheDocument();
    });

    it("keeps existing figures and does not append when the upload fails", async () => {
        uploadReportImage.mockRejectedValue(new Error("El archivo HEIC es una secuencia de imágenes."));
        const onChange = vi.fn();
        const existing = [{ id: "a", url: "u1", thumbnailUrl: "t1", caption: "uno" }];
        const { container } = render(<App><ReportImages sampleId="s1" value={existing} onChange={onChange} /></App>);
        await userEvent.setup({ applyAccept: false }).upload(fileInput(container), heic());
        expect(await screen.findByText(/secuencia de imágenes/)).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
