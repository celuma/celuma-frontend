/**
 * Céluma 1.5 (#88/#96) — the order conversation tab: states, sending, failure and retry,
 * attachments before sending, and the read-only state. Synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listConversation = vi.fn();
const sendConversationMessage = vi.fn();
const fetchAttachmentBlob = vi.fn();

vi.mock("../../services/conversation_service", async () => {
    const actual = await vi.importActual<typeof import("../../services/conversation_service")>("../../services/conversation_service");
    return {
        ...actual,
        listConversation: (...a: unknown[]) => listConversation(...a),
        sendConversationMessage: (...a: unknown[]) => sendConversationMessage(...a),
        fetchAttachmentBlob: (...a: unknown[]) => fetchAttachmentBlob(...a),
    };
});
vi.mock("../../components/comments/comment_service", () => ({ searchMentionUsers: vi.fn().mockResolvedValue([]) }));

import OrderConversation from "../../components/comments/order_conversation";
import { ConversationSendError, type ConversationMessage } from "../../services/conversation_service";
import { mergeMessages } from "../../hooks/use_order_conversation";
import { addConversationImages } from "../../lib/conversation_attachments";

const ME = "u-me";
const message = (id: string, over: Partial<ConversationMessage> = {}): ConversationMessage => ({
    id, order_id: "o1", created_by: "u-other", created_by_name: "Dra. Sintética", created_at: "2026-11-25T15:00:00",
    text: `Mensaje ${id}`, mentions: [], mentioned_users: [], attachments: [], ...over,
});
const page = (items: ConversationMessage[], has_more = false) => ({ items, page_info: { has_more, next_before: has_more ? "cur" : null } });
const jpeg = (name = "foto.jpg", size = 2048) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

function renderConversation(canComment = true) {
    return render(<OrderConversation orderId="o1" currentUserId={ME} canComment={canComment} active />);
}
const composer = () => screen.getByRole("textbox", { name: "Mensaje para la conversación" });
const sendButton = () => screen.getByRole("button", { name: "Enviar mensaje" });

beforeEach(() => {
    listConversation.mockReset();
    sendConversationMessage.mockReset();
    fetchAttachmentBlob.mockReset();
    fetchAttachmentBlob.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
    globalThis.URL.createObjectURL = vi.fn(() => "blob:synthetic");
    globalThis.URL.revokeObjectURL = vi.fn();
});

describe("loading, empty and failed load", () => {
    it("shows the empty state", async () => {
        listConversation.mockResolvedValue(page([]));
        renderConversation();
        expect(await screen.findByText("Aún no hay mensajes")).toBeInTheDocument();
    });

    it("shows a failed load with a working retry", async () => {
        listConversation.mockRejectedValueOnce(new Error("No se pudo conectar con el servidor."));
        listConversation.mockResolvedValueOnce(page([message("m1")]));
        renderConversation();
        expect(await screen.findByText("No se pudo cargar la conversación")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
        expect(await screen.findByText("Mensaje m1")).toBeInTheDocument();
    });

    it("groups by author, names the author and offers older messages", async () => {
        listConversation.mockResolvedValueOnce(page([
            message("m1"), message("m2", { created_at: "2026-11-25T15:01:00" }),
            message("m3", { created_by: ME, created_by_name: "Yo", created_at: "2026-11-25T15:02:00" }),
        ], true));
        listConversation.mockResolvedValueOnce(page([message("m0", { created_at: "2026-11-25T14:00:00" })]));
        renderConversation();
        expect(await screen.findByText("Mensaje m1")).toBeInTheDocument();
        expect(screen.getAllByText("Dra. Sintética")).toHaveLength(1); // one header for the grouped pair
        expect(screen.getByText("Tú")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Ver mensajes anteriores/ }));
        expect(await screen.findByText("Mensaje m0")).toBeInTheDocument();
        expect(listConversation).toHaveBeenLastCalledWith("o1", { before: "cur" });
        expect(screen.getByText(/Inicio de la conversación/)).toBeInTheDocument();
    });
});

describe("sending", () => {
    it("sends, shows the confirmed message and clears the composer", async () => {
        listConversation.mockResolvedValue(page([]));
        sendConversationMessage.mockResolvedValue({ message: message("new", { created_by: ME, text: "Hola equipo" }), replayed: false });
        renderConversation();
        await screen.findByText("Aún no hay mensajes");
        await userEvent.type(composer(), "Hola equipo");
        await userEvent.click(sendButton());
        expect(await screen.findByText("Hola equipo")).toBeInTheDocument();
        expect(composer()).toHaveValue("");
        const [, payload, key] = sendConversationMessage.mock.calls[0];
        expect(payload).toEqual({ text: "Hola equipo", mentions: [], files: [] });
        expect(typeof key).toBe("string");
    });

    it("keeps an unconfirmed message and retries it with the SAME key", async () => {
        listConversation.mockResolvedValue(page([]));
        sendConversationMessage
            .mockRejectedValueOnce(new ConversationSendError("No se pudo conectar con el servidor.", null, false))
            .mockResolvedValueOnce({ message: message("saved", { created_by: ME, text: "Texto perdido" }), replayed: true });
        renderConversation();
        await screen.findByText("Aún no hay mensajes");
        await userEvent.type(composer(), "Texto perdido");
        await userEvent.click(sendButton());
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("No se confirmó el envío");
        expect(screen.getByText(/reintentar no lo duplica/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Corregir/ })).toBeNull(); // the outcome is unknown
        await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
        await waitFor(() => expect(sendConversationMessage).toHaveBeenCalledTimes(2));
        expect(sendConversationMessage.mock.calls[1][2]).toBe(sendConversationMessage.mock.calls[0][2]);
        expect(await screen.findByText("Texto perdido")).toBeInTheDocument();
        expect(screen.queryByText("No se confirmó el envío")).toBeNull();
    });

    it("after a definitive refusal puts text and images back in the composer", async () => {
        listConversation.mockResolvedValue(page([]));
        sendConversationMessage.mockRejectedValue(
            new ConversationSendError("La imagen 1 no es un formato compatible. Usa JPG, PNG, WebP o HEIC.", 415, true),
        );
        const { container } = renderConversation();
        await screen.findByText("Aún no hay mensajes");
        await userEvent.type(composer(), "Con imagen");
        await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, jpeg());
        await userEvent.click(sendButton());
        expect(await screen.findByText(/no es un formato compatible/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Corregir/ }));
        expect(composer()).toHaveValue("Con imagen");
        expect(screen.getByRole("list", { name: /Imágenes para enviar: 1/ })).toBeInTheDocument();
    });
});

describe("attachments before sending", () => {
    it("previews, removes and refuses what the server would refuse", async () => {
        listConversation.mockResolvedValue(page([]));
        const { container } = renderConversation();
        await screen.findByText("Aún no hay mensajes");
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        await userEvent.setup({ applyAccept: false }).upload(input, [
            jpeg("a.jpg"), new File(["%PDF"], "informe.pdf", { type: "application/pdf" }),
        ]);
        expect(screen.getByRole("alert")).toHaveTextContent("«informe.pdf» no es un formato compatible");
        const list = screen.getByRole("list", { name: /Imágenes para enviar: 1 de 4/ });
        expect(within(list).getByRole("img", { name: "Imagen 1 seleccionada" })).toBeInTheDocument();
        expect(sendButton()).toBeEnabled(); // image-only message is allowed
        await userEvent.click(screen.getByRole("button", { name: "Quitar imagen 1" }));
        expect(screen.queryByRole("list", { name: /Imágenes para enviar/ })).toBeNull();
        expect(sendButton()).toBeDisabled();
    });

    it("opens a history image in an accessible viewer", async () => {
        listConversation.mockResolvedValue(page([message("m1", {
            attachments: [{ id: "a1", position: 0, width: 64, height: 48 }, { id: "a2", position: 1, width: 64, height: 48 }],
        })]));
        renderConversation();
        const open = await screen.findByRole("button", { name: "Abrir imagen 1 de 2 de Dra. Sintética" });
        await userEvent.click(open);
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Imagen 1 de 2 de Dra. Sintética")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: /Siguiente/ }));
        expect(within(dialog).getByText("Imagen 2 de 2 de Dra. Sintética")).toBeInTheDocument();
        expect(fetchAttachmentBlob).toHaveBeenCalledWith("o1", "m1", "a2", "full", expect.anything());
    });
});

describe("permissions and helpers", () => {
    it("is read-only without lab:manage_comments", async () => {
        listConversation.mockResolvedValue(page([message("m1")]));
        renderConversation(false);
        await screen.findByText("Mensaje m1");
        expect(screen.queryByRole("textbox", { name: "Mensaje para la conversación" })).toBeNull();
        expect(screen.getByText(/tu rol no permite escribir/)).toBeInTheDocument();
    });

    it("merges by id without duplicates and in time order", () => {
        const merged = mergeMessages([message("b", { created_at: "2026-11-25T15:02:00" })], [
            message("a", { created_at: "2026-11-25T15:01:00" }), message("b", { created_at: "2026-11-25T15:02:00", text: "editado" }),
        ]);
        expect(merged.map((m) => [m.id, m.text])).toEqual([["a", "Mensaje a"], ["b", "editado"]]);
    });

    it("applies the count, type and size limits", () => {
        const five = Array.from({ length: 5 }, (_, i) => jpeg(`f${i}.jpg`));
        expect(addConversationImages([], five).accepted).toHaveLength(4);
        expect(addConversationImages([], [jpeg("big.jpg", 10 * 1024 * 1024 + 1)]).errors[0]).toContain("10 MB");
        expect(addConversationImages([], [new File(["x"], "IMG.HEIC", { type: "" })]).accepted).toHaveLength(1);
    });

    it("polls only while visible", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        listConversation.mockResolvedValue(page([message("m1")]));
        renderConversation();
        await screen.findByText("Mensaje m1");
        await act(async () => { vi.advanceTimersByTime(30_000); });
        await waitFor(() => expect(listConversation).toHaveBeenCalledTimes(2));
        vi.useRealTimers();
    });
});
