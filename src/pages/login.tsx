import {useState} from "react";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import * as z from "zod"
import styles from "../styles/login.module.css";
import celumaLogo from "../images/celuma-isotipo.png";

// Auxiliary function to validate if the value is in email format.
const isEmail = (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
};

// Validation scheme with Zod.
const schema = z.object({
    // "identifier" can be user or email.
    identifier: z
        .string()
        .trim()
        .nonempty("El usuario o email es obligatorio.")
        .refine(
            (value) => isEmail(value) || (value.length >= 8 && value.length <= 24),
            { message: "Escriba un email válido o un usuario (8 - 24 caracteres)" }
        ),
    // Password validation
    password: z
        .string()
        .min(8, "Mínimo 8 caracteres.")
        .nonempty("La contraseña es obligatoria.")
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."),
    remember: z.boolean()
});

// Data typing that complies with the schema.
type FormData = z.infer<typeof schema>;

export default function Login() {
    const [serverError, setServerError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({ resolver: zodResolver(schema), mode: "onBlur", defaultValues: {remember: false} });

    // Form submission logic.
    const onSubmit = async (data: FormData) => {
        setServerError(null);

        // Depending on whether it is email or user, it creates the payload.
        const payload = isEmail(data.identifier)
            ? { email: data.identifier.trim(), password: data.password, remember: data.remember }
            : { username: data.identifier.trim(), password: data.password, remember: data.remember };
        try {
            // Request to the backend using the URL in .env (VITE_API_BACKEND_HOST).
            const response = await fetch(`${import.meta.env.VITE_API_BACKEND_HOST}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || "Error en la autenticación.");
            }

            alert("¡Login exitoso!");
        } catch (err: unknown) {
            if (err instanceof Error) {
                setServerError(err.message ?? "Ocurrió un error inesperado.");
            } else {
                setServerError("Ocurrió un error inesperado.");
            }
        }
    };

    return (
        <main className = {styles.page}>
            <section className = {styles.card} role = "form" aria-labelledby = "title">
                {/* Header with logo and brand */}
                <header className = {styles.brand}>
                    <img
                        src = {celumaLogo}
                        alt = "Logo Céluma"
                        className = {styles.logo}
                    />
                    <h1 className={styles.brandName}> Céluma </h1>
                </header>

                <h2 id = "title" className = {styles.title}> Inicio de Sesión </h2>

                {/* Form with validation */}
                <form onSubmit = {handleSubmit(onSubmit)} noValidate>

                    {/* User or email field */}
                    <label className = {styles.label} htmlFor = "identifier">
                        USUARIO O EMAIL <span aria-hidden>*</span>
                    </label>
                    <input
                        id = "identifier"
                        type = "text"
                        placeholder = "Escriba aquí…"
                        className = {`${styles.input} ${errors.identifier ? styles.inputError : ""}`}
                        aria-invalid = {!!errors.identifier}
                        {...register("identifier")}
                    />
                    {errors.identifier && (
                        <p className={styles.error}>{errors.identifier.message}</p>
                    )}

                    {/* Password field */}
                    <label className = {styles.label} htmlFor = "password">
                        CONTRASEÑA <span aria-hidden>*</span>
                    </label>
                    <input
                        id = "password"
                        type = "password"
                        placeholder = "Escriba aquí…"
                        className = {`${styles.input} ${errors.password ? styles.inputError : ""}`}
                        aria-invalid = {!!errors.password}
                        {...register("password")}
                    />
                    {errors.password && (
                        <p className={styles.error}>{errors.password.message}</p>
                    )}

                    {/* Remember me checkbox */}
                    <div className = {styles.rememberRow}>
                        <input
                            id = "remember"
                            type = "checkbox"
                            className = {styles.checkbox}
                            {...register("remember")}
                        />
                        <label htmlFor = "remember" className={styles.rememberLabel}>
                            Recuérdame
                  </label>
                    </div>

                    {/* Server error */}
                    {serverError && <p className = {styles.serverError}>{serverError}</p>}

                    {/* Submit button */}
                    <button className = {styles.primaryBtn} type = "submit" disabled = {isSubmitting}>
                        {isSubmitting ? "Ingresando…" : "Iniciar Sesión"}
                    </button>

                    {/* Help links*/}
                    <div className = {styles.linksRow}>
                        <a href = "#" className = {styles.link}>¿Olvidó su contraseña?</a>
                        <span className = {styles.dotSep} aria-hidden>•</span>
                        <a href = "#" className = {styles.link}>Registrarme</a>
                    </div>
                </form>
            </section>
        </main>
    );
}