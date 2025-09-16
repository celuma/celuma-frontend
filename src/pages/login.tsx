import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useNavigate } from "react-router-dom";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

/* Reutilizables */
import AuthCard from "../components/auth/auth_card";
import BrandHeader from "../components/auth/brand_header";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import PasswordField from "../components/ui/password_field";
import Checkbox from "../components/ui/checkbox";
import Button from "../components/ui/button";
import AlertText from "../components/ui/error_text";

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
    const [serverError, setServerError] = useState<string | null>(null);
    const navigate = useNavigate();

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

        // Payload requerido por el backend (tenant_id vacío, no visible al usuario)
        const payload = {
            username_or_email: data.identifier.trim(),
            password: data.password,
            tenant_id: "", // ← por ahora vacío
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
            try { json = text ? JSON.parse(text) : undefined; } catch { /* respuesta no-JSON */ }

            if (!resp.ok) {
                const msg =
                    (json as { message?: string } | undefined)?.message ??
                    `${resp.status} ${resp.statusText}`;
                throw new Error(msg);
            }

            const { access_token, token_type } = (json ?? {}) as LoginSuccess;
            
            if (access_token && token_type) {
                const bearer = `${token_type} ${access_token}`;
                // Guarda el token según "Recuérdame"
                if (data.remember) {
                    localStorage.setItem("auth_token", bearer);
                } else {
                    sessionStorage.setItem("auth_token", bearer);
                }
            } else {
                throw new Error("No access token received from server");
            }

            navigate("/home", { replace: true });
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        }
    });

    return (
        <AuthCard
            header={<BrandHeader title="Céluma"/>}
            footer={
                <div style={{ display: "flex", gap: 8, justifyContent: "center", fontSize: 14 }}>
                    <a href="#">¿Olvidó su contraseña?</a>
                    <span aria-hidden>•</span>
                    <Link to="/register">Registrarme</Link>
                </div>
            }
            maxWidth={460}
        >
            <form onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 14 }}>
                {/* Usuario / email */}
                <FormField
                    control={control}
                    name="identifier"
                    render={(p) => (
                        <TextField
                            {...p}
                            placeholder="Escriba su usuario o email"
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
                        <PasswordField
                            {...p}
                            placeholder="Escriba su contraseña"
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
            </form>
        </AuthCard>
    );
}
