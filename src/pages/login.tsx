import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import styles from "../styles/login.module.css";
import celumaLogo from "../images/celuma-isotipo.png";
import { Input, Checkbox, Button } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

/* Validation email address */
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const schema = z.object({
    /* Validation user or email */
    identifier: z
        .string()
        .trim()
        .nonempty("El usuario o email es obligatorio.")
        .refine(
            (v) => isEmail(v) || (v.length >= 8 && v.length <= 24),
            { message: "Escriba un email válido o un usuario (8 - 24 caracteres)" }
        ),
    /* Validation password */
    password: z
        .string()
        .nonempty("La contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
            "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."
        ),
    remember: z.boolean().default(false),
});

/* Type of form data */
type FormData = z.infer<typeof schema>;

export default function Login() {
    const [serverError, setServerError] = useState<string | null>(null);

    /* React Hook Form setup */
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting, touchedFields, submitCount },
        clearErrors,
    } = useForm<FormData>({
        resolver: zodResolver(schema),
        mode: "onBlur",
        reValidateMode: "onChange",
        defaultValues: { identifier: "", password: "", remember: false },
    });

    /* Function to determine if an error should be shown */
    const showError = (name: keyof FormData) =>
        errors[name] && (touchedFields[name] || submitCount > 0);

    /* Form submission handler */
    const onSubmit = async (data: FormData) => {
        setServerError(null);

        const payload = isEmail(data.identifier)
            ? { email: data.identifier.trim(), password: data.password, remember: data.remember }
            : { username: data.identifier.trim(), password: data.password, remember: data.remember };

        try {
            /* API call to the backend */
            const response = await fetch(`${import.meta.env.VITE_API_BACKEND_HOST}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include",
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || "Error en la autenticación.");
            }

            alert("¡Login exitoso!");
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
        }
    };

    return (
        <main className={styles.page}>
            <section className={styles.card} role="form" aria-labelledby="title">
                {/* Logo and brand */}
                <header className={styles.brand}>
                    <img src={celumaLogo} alt="Logo Céluma" className={styles.logo} />
                    <h1 className={styles.brandName}>Céluma</h1>
                </header>
                <h2 id="title" className={styles.title}>Inicio de Sesión</h2>

                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    {/* User or email field */}
                    <Controller
                        name="identifier"
                        control={control}
                        render={({ field }) => (
                            <>
                                <Input
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        clearErrors("identifier");
                                    }}
                                    className={styles.inputs}
                                    placeholder="Escriba su usuario o email"
                                    prefix={<UserOutlined />}
                                    allowClear
                                    size="large"
                                    status={showError("identifier") ? "error" : ""}
                                    aria-invalid={!!errors.identifier}
                                />
                                {showError("identifier") && (
                                    <p role="alert" className={styles.error}>{errors.identifier?.message}</p>
                                )}
                            </>
                        )}
                    />

                    {/* Password field */}
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <>
                                <Input.Password
                                    {...field}
                                    onChange={(e) => {
                                        field.onChange(e);
                                        clearErrors("password");
                                    }}
                                    className={styles.inputs}
                                    placeholder="Escriba su contraseña"
                                    prefix={<LockOutlined />}
                                    size="large"
                                    status={showError("password") ? "error" : ""}
                                    aria-invalid={!!errors.password}
                                />
                                {showError("password") && (
                                    <p role="alert" className={styles.error}>{errors.password?.message}</p>
                                )}
                            </>
                        )}
                    />

                    {/* Remember me checkbox */}
                    <Controller
                        name="remember"
                        control={control}
                        render={({ field }) => (
                            <Checkbox
                                className={styles.checkboxs}
                                checked={field.value}
                                onChange={(e) => field.onChange(e.target.checked)}
                            >
                                Recuérdame
                            </Checkbox>
                        )}
                    />

                    {/* Server error */}
                    {serverError && <p role="alert" className={styles.error}>{serverError}</p>}

                    {/* Button */}
                    <Button
                        type="primary"
                        htmlType="submit"
                        className={styles.buttons}
                        loading={isSubmitting} > Iniciar Sesión
                    </Button>

                    {/* Links */}
                    <div className={styles.linksRow}>
                        <a href="#" className={styles.link}>¿Olvidó su contraseña?</a>
                        <span className={styles.dotSep} aria-hidden>•</span>
                        <a href="#" className={styles.link}>Registrarme</a>
                    </div>
                </form>
            </section>
        </main>
    );
}
