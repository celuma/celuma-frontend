import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Alert } from "antd";

/* Reutilizables */
import AuthLayout from "../components/auth/auth_layout";
import AuthCard from "../components/auth/auth_card";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import FloatingCaptionPassword from "../components/ui/floating_caption_password";
import Checkbox from "../components/ui/checkbox";
import Button from "../components/ui/button";
import AlertText from "../components/ui/error_text";
import CelumaModal from "../components/ui/celuma_modal";
import { usePageTitle } from "../hooks/use_page_title";

/* --------- Validación --------- */
const schema = z.object({
    identifier: z.string().trim().nonempty("El usuario o email es obligatorio."),
    password: z
        .string()
        .nonempty("La contraseña es obligatoria."),
    remember: z.boolean(),
});

type FormData = z.infer<typeof schema>;

/* --------- Utils --------- */
function apiBase(): string {
    return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
}

type LoginSuccess = {
    access_token: string;
    token_type: string;
};

export default function Login() {
    usePageTitle();
    const [serverError, setServerError] = useState<string | null>(null);
    const [forgotOpen, setForgotOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    // Determine session message from router state or query string
    const stateFrom = (location.state as { from?: string; sessionExpired?: boolean } | null);
    const isSessionExpired =
        stateFrom?.sessionExpired === true ||
        searchParams.get("reason") === "session_expired";
    const requiresAuth = !isSessionExpired && !!stateFrom?.from;

    const {
        control,
        handleSubmit,
        formState: { isSubmitting },
        clearErrors,
    } = useForm<FormData>({
        resolver: zodResolver(schema),
        mode: "onSubmit",
        reValidateMode: "onChange",
        defaultValues: { identifier: "", password: "", remember: false },
    });

    const onSubmit = handleSubmit(async (data) => {
        setServerError(null);

        const payload = {
            username_or_email: data.identifier.trim(),
            password: data.password,
            tenant_id: "",
        };

        try {
            const resp = await fetch(`${apiBase()}/v1/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify(payload),
                credentials: "include",
            });

            const text = await resp.text();
            let json: unknown = undefined;
            try { json = text ? JSON.parse(text) : undefined; } catch (err) { console.warn("Non-JSON response", err); }

            if (!resp.ok) {
                const msg = (json as { message?: string } | undefined)?.message ?? `${resp.status} ${resp.statusText}`;
                throw new Error(msg);
            }

            // Two possible shapes: LoginResponse or tenant selection
            const isTenantSelection = (v: unknown): v is { need_tenant_selection: boolean } =>
                typeof v === "object" && v !== null && "need_tenant_selection" in (v as Record<string, unknown>);
            if (isTenantSelection(json) && json.need_tenant_selection) {
                setServerError("Este usuario pertenece a múltiples tenants. Por ahora, inicie con tenant específico.");
                return;
            }

            const { access_token, token_type, tenant_id } = (json ?? {}) as LoginSuccess & { tenant_id?: string };

            if (access_token && token_type) {
                const bearer = `${token_type} ${access_token}`;
                if (data.remember) {
                    localStorage.setItem("auth_token", bearer);
                    sessionStorage.removeItem("auth_token");
                } else {
                    sessionStorage.setItem("auth_token", bearer);
                    localStorage.removeItem("auth_token");
                }
            } else {
                throw new Error("No access token received from server");
            }

            if (!tenant_id) {
                throw new Error("El servidor no devolvió tenant_id. Actualice el backend.");
            }

            if (data.remember) {
                localStorage.setItem("tenant_id", tenant_id);
                sessionStorage.removeItem("tenant_id");
            } else {
                sessionStorage.setItem("tenant_id", tenant_id);
                localStorage.removeItem("tenant_id");
            }

            // Fetch profile: persist user_id and determine redirect target
            let redirectPath = "/home";
            try {
                const meRes = await fetch(`${apiBase()}/v1/auth/me`, {
                    method: "GET",
                    headers: {
                        accept: "application/json",
                        Authorization: (localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || ""),
                    },
                    credentials: "include",
                });
                const meText = await meRes.text();
                const me = meText
                    ? (JSON.parse(meText) as { id?: string; permissions?: string[] })
                    : {};

                if (me?.id) {
                    if (data.remember) {
                        localStorage.setItem("user_id", me.id);
                        sessionStorage.removeItem("user_id");
                    } else {
                        sessionStorage.setItem("user_id", me.id);
                        localStorage.removeItem("user_id");
                    }
                }

                // Redirect physician-only users to their portal
                const perms = me?.permissions ?? [];
                if (perms.includes("portal:physician_access") && !perms.includes("lab:read")) {
                    redirectPath = "/physician-portal";
                }
            } catch {
                // Non-critical; default redirect applies
            }

            navigate(redirectPath, { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        }
    });

    return (
        <AuthLayout activeLink="login">
            <AuthCard maxWidth={520}>
                <CelumaModal
                    open={forgotOpen}
                    onCancel={() => setForgotOpen(false)}
                    footer={null}
                    title="Recuperación de acceso"
                >
                    <div style={{ display: "grid", gap: 12 }}>
                        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                            Por el momento la recuperación de contraseña no está automatizada.
                            Por favor póngase en contacto con el equipo de desarrollo para brindarle soporte.
                        </p>
                    </div>
                </CelumaModal>
                {/* Session alerts */}
                {isSessionExpired && (
                    <Alert
                        type="warning"
                        showIcon
                        message="Sesión expirada"
                        description="Tu sesión no es válida o expiró. Vuelve a iniciar sesión para continuar."
                        style={{ marginBottom: 8 }}
                    />
                )}
                {requiresAuth && (
                    <Alert
                        type="info"
                        showIcon
                        message="Inicio de sesión requerido"
                        description="Debes iniciar sesión para acceder a esa sección."
                        style={{ marginBottom: 8 }}
                    />
                )}

                <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                    {/* Usuario / email */}
                    <FormField
                        control={control}
                        name="identifier"
                        render={(p) => (
                            <FloatingCaptionInput
                                {...p}
                                label="Usuario o email"
                                prefixNode={<UserOutlined />}
                                showClear
                                error={p.error}
                                value={typeof p.value === "string" ? p.value : ""}
                                onChange={(e) => {
                                    p.onChange(e);
                                    clearErrors("identifier");
                                }}
                            />
                        )}
                    />

                    {/* Contraseña */}
                    <FormField
                        control={control}
                        name="password"
                        render={(p) => (
                            <FloatingCaptionPassword
                                {...p}
                                label="Contraseña"
                                prefixNode={<LockOutlined />}
                                error={p.error}
                                value={typeof p.value === "string" ? p.value : ""}
                                onChange={(e) => {
                                    p.onChange(e);
                                    clearErrors("password");
                                }}
                            />
                        )}
                    />

                    {/* Recordarme */}
                    <FormField
                        control={control}
                        name="remember"
                        render={(p) => (
                            <Checkbox
                                checked={!!p.value}
                                onChange={(e) => p.onChange(e.target.checked)}
                                label="Recuérdame"
                            />
                        )}
                    />

                    {/* Error del servidor */}
                    {serverError && <AlertText variant="error">{serverError}</AlertText>}

                    {/* Botón */}
                    <Button type="primary" htmlType="submit" loading={isSubmitting} fullWidth>
                        Iniciar Sesión
                    </Button>
                    
                    {/* Forgot password link */}
                    <div style={{ textAlign: "center", marginTop: 8 }}>
                        <button
                            type="button"
                            onClick={() => setForgotOpen(true)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "#0f8b8d",
                                cursor: "pointer",
                                textDecoration: "underline",
                                fontSize: 14,
                            }}
                        >
                            ¿Olvidó su contraseña?
                        </button>
                    </div>
                </form>
            </AuthCard>
        </AuthLayout>
    );
}
