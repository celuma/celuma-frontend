import { App, message as staticMessage } from "antd";

/**
 * The toast API for components under `<App>`. antd's static `message.*` renders
 * nothing with React 19 on antd 5 (its console warning "support React is 16 ~
 * 18"), so a toast raised through it is never seen. The context API works, and
 * the static one is kept only as the fallback outside an `<App>` provider
 * (unit tests that render a component on its own).
 */
export function useNotice(): typeof staticMessage {
    const { message } = App.useApp();
    return typeof message?.error === "function" ? (message as typeof staticMessage) : staticMessage;
}
