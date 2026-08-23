/**
 * Céluma 1.3, Phase 3, Block D — the Profile page's notification-preferences
 * section.
 *
 * Its own component rather than 200 more lines inside `pages/profile.tsx`
 * (already 760), for two concrete reasons rather than tidiness: the visual
 * harness can mount it without standing up the whole profile page and its
 * `/auth/me` fetch, and its component tests do not have to stub three
 * unrelated services to reach it. `profile.tsx` renders it in one line, so it
 * appears identically at `/profile` and at `/config/profile` — the page's
 * `embedded` prop only changes what wraps the section list, not the list.
 *
 * Scope, deliberately narrow
 * --------------------------
 * Only `email_enabled` is exposed. There is **no in-app switch**: internal
 * notifications are the durable operational channel, Block C treats the inbox
 * as the primary surface, and event-level mandatory/optional policy is not
 * designed yet — so letting a user hide internal notifications would remove
 * workflow visibility they have no other way to recover. The API returns
 * `in_app_enabled` for future compatibility and refuses to write `false`.
 *
 * Equally absent, and asserted absent by the tests: delivery status, attempt
 * counts, error codes, resend, provider metadata. Those belong to a worker
 * that does not exist yet, and a placeholder control for one would be a
 * button that does nothing.
 *
 * This section starts no interval and reads no inbox state — the Notification
 * Center's provider stays the one polling owner.
 */
import { Card, Divider } from "antd";
import { BellOutlined } from "@ant-design/icons";
import CelumaSwitch from "./celuma_switch";
import CelumaButton from "./button";
import Panel from "./panel";
import { tokens, cardTitleStyle, cardStyle } from "../design/tokens";
import { showCelumaApiError, showCelumaSuccess } from "../../lib/celuma_feedback";
import { useNotificationPreferences } from "../../hooks/use_notification_preferences";
import { notificationTypeLabel } from "../../models/notification";
import {
    notificationTypeDescription,
    PREFERENCES_DEFAULT_BADGE,
    PREFERENCES_EMAIL_UNSUPPORTED,
    PREFERENCES_LOAD_ERROR,
    PREFERENCES_RESET,
    PREFERENCES_SAVE,
    PREFERENCES_SAVE_ERROR,
    PREFERENCES_SAVE_SUCCESS_DESCRIPTION,
    PREFERENCES_SAVE_SUCCESS_TITLE,
    PREFERENCES_SECTION_DESCRIPTION,
    PREFERENCES_SECTION_TITLE,
    emailSwitchLabel,
} from "../../models/notification_preference";
import type { NotificationType } from "../../models/notification";

export default function NotificationPreferencesSection() {
    const {
        preferences,
        loading,
        saving,
        dirty,
        error,
        setEmailEnabled,
        save,
        reset,
    } = useNotificationPreferences();

    const handleSave = async () => {
        try {
            await save();
            showCelumaSuccess(
                PREFERENCES_SAVE_SUCCESS_TITLE,
                PREFERENCES_SAVE_SUCCESS_DESCRIPTION,
            );
        } catch (err) {
            // `showCelumaApiError` already swallows the "Session expired"
            // sentinel, so a redirect never collects a toast on top of it.
            showCelumaApiError(err, PREFERENCES_SAVE_ERROR);
        }
    };

    // The list failed to load and there is nothing to render. A save failure
    // is different: the rows are still on screen and still edited, so it is
    // reported as a toast rather than by replacing the section.
    const loadFailed = error !== null && preferences.length === 0;

    return (
        <Card
            className="celuma-notification-preferences"
            title={
                <span style={cardTitleStyle}>
                    <BellOutlined style={{ color: tokens.primary, marginRight: 8 }} />
                    {PREFERENCES_SECTION_TITLE}
                </span>
            }
            style={cardStyle}
            loading={loading && preferences.length === 0}
            data-testid="notification-preferences-section"
        >
            {/* antd's Card head truncates its title with an ellipsis at any
                width. "Preferencias de notificaciones" is long enough to be
                cut to "Preferencias de noti…" on a phone, which hides the
                name of the section a user navigated to — found by looking at
                the mobile golden, not by inspection. Scoped to this card by
                class, so no other Card's header changes. */}
            <style>{`
                .celuma-notification-preferences .ant-card-head-title {
                    white-space: normal;
                    overflow: visible;
                    text-overflow: clip;
                }
            `}</style>
            <p style={{ marginTop: 0, marginBottom: 16, color: tokens.textSecondary, fontSize: 13 }}>
                {PREFERENCES_SECTION_DESCRIPTION}
            </p>

            {loadFailed ? (
                <p role="alert" style={{ margin: 0, color: tokens.errorText, fontSize: 13 }}>
                    {PREFERENCES_LOAD_ERROR}
                </p>
            ) : (
                <>
                    <div style={{ display: "grid", gap: 10 }}>
                        {preferences.map((item) => {
                            const label = notificationTypeLabel(item.notification_type);
                            // Block F: through the locale-aware helper rather
                            // than indexing the map, so an unknown type
                            // degrades to an empty description instead of
                            // `undefined` reaching the DOM.
                            const description = notificationTypeDescription(
                                item.notification_type,
                            );
                            return (
                                <Panel
                                    key={item.notification_type}
                                    data-testid={`notification-preference-${item.notification_type}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 16,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 8,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: tokens.textPrimary,
                                                    fontSize: 14,
                                                }}
                                            >
                                                {label}
                                            </span>
                                            {/* Tells a user whether a value is theirs or
                                                Céluma's — the only thing distinguishing an
                                                explicit override from a default. */}
                                            {!item.is_explicit && (
                                                <span
                                                    style={{
                                                        background: "#f3f4f6",
                                                        color: "#6b7280",
                                                        borderRadius: 8,
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        padding: "2px 8px",
                                                    }}
                                                >
                                                    {PREFERENCES_DEFAULT_BADGE}
                                                </span>
                                            )}
                                        </div>
                                        {description && (
                                            <div
                                                style={{
                                                    marginTop: 2,
                                                    color: tokens.textSecondary,
                                                    fontSize: 12,
                                                }}
                                            >
                                                {description}
                                            </div>
                                        )}
                                        {!item.email_supported && (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    color: tokens.textSecondary,
                                                    fontSize: 12,
                                                    fontStyle: "italic",
                                                }}
                                            >
                                                {PREFERENCES_EMAIL_UNSUPPORTED}
                                            </div>
                                        )}
                                    </div>

                                    {/* CelumaSwitch takes antd SwitchProps, so it is
                                        labelled with aria-label the same way the
                                        notifications page labels its unread-only
                                        toggle. The name includes the type, because
                                        six switches reading "Correo electrónico"
                                        would be six identical accessible names. */}
                                    <CelumaSwitch
                                        checked={item.email_enabled}
                                        disabled={!item.email_supported || saving || loading}
                                        onChange={(checked) =>
                                            setEmailEnabled(
                                                item.notification_type as NotificationType,
                                                checked,
                                            )
                                        }
                                        aria-label={emailSwitchLabel(label)}
                                    />
                                </Panel>
                            );
                        })}
                    </div>

                    <Divider style={{ margin: "20px 0 16px 0" }} />

                    {/* `profile.tsx` has no page-level save: each of its cards owns
                        its own submit, so this section follows that and owns its
                        own pair. Save is disabled when there is nothing to save,
                        which is also what makes the explicit-save model legible. */}
                    {/* `flexWrap` is load-bearing, not decorative: the two
                        pill buttons together are wider than the card at a
                        390px viewport, and without it they overflowed the
                        card and clipped "Restablecer" — again caught by the
                        mobile golden. */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <CelumaButton
                            onClick={reset}
                            disabled={!dirty || saving || loading}
                        >
                            {PREFERENCES_RESET}
                        </CelumaButton>
                        <CelumaButton
                            type="primary"
                            onClick={handleSave}
                            loading={saving}
                            disabled={!dirty || saving || loading}
                        >
                            {PREFERENCES_SAVE}
                        </CelumaButton>
                    </div>
                </>
            )}
        </Card>
    );
}
