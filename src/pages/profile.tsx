import { useState, useEffect } from "react";
import { Layout, Card, notification, Avatar, Upload, message as antdMessage } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UserOutlined, MailOutlined, KeyOutlined, UploadOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import PasswordField from "../components/ui/password_field";
import Button from "../components/ui/button";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens } from "../components/design/tokens";
import type { UploadFile } from "antd/es/upload/interface";

// Types for the API responses and form data
interface UserProfile {
    id: string;
    email: string;
    username: string | null;
    full_name: string;
    role: string;
    tenant_id: string;
    avatar_url?: string;
}

// Validation schemas
const profileSchema = z.object({
    full_name: z.string().trim().nonempty("El nombre completo es obligatorio."),
    username: z.string(),
    email: z.string().trim().nonempty("El correo electrónico es obligatorio.").email("Formato de email inválido."),
});

const passwordSchema = z.object({
    current_password: z.string().nonempty("La contraseña actual es obligatoria."),
    new_password: z.string()
        .nonempty("La nueva contraseña es obligatoria.")
        .min(8, "Mínimo 8 caracteres.")
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
            "La contraseña debe contener al menos una minúscula, una mayúscula, un número y un carácter especial."
        ),
    confirm_password: z.string().nonempty("Confirmar contraseña es obligatorio."),
}).refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm_password"],
});

// Type inference from schemas
type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const Profile: React.FC = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [avatarFile, setAvatarFile] = useState<UploadFile | null>(null);

    // Forms for profile and password update with validation
    const profileForm = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        mode: "onChange",
    });
    
    const passwordForm = useForm<PasswordFormData>({
        resolver: zodResolver(passwordSchema),
        mode: "onChange",
        defaultValues: {
            current_password: "",
            new_password: "",
            confirm_password: "",
        },
    });

    // API Base URL - consistent with login.tsx approach
    const apiBase = () => {
        return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
    };
    
    // API configuration logs (can be removed in production)
    if (import.meta.env.DEV) {
        console.log("API_BASE configured as:", apiBase());
    }

    // Get auth token from localStorage
    const getAuthToken = () => {
        const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
        
        // Debug logging (only in development)
        if (import.meta.env.DEV && !token) {
            console.warn("No authentication token found");
        }
        
        return token;
    };

    // Fetch current user profile 
    const fetchProfile = async () => {
        try {
            setProfileLoading(true);
            const token = getAuthToken();
            
            if (!token) {
                nav("/login");
                return;
            }

            const url = `${apiBase()}/v1/auth/me`;
            const response = await fetch(url, {
                headers: {
                    "Authorization": token, // token already includes "Bearer "
                    "Content-Type": "application/json"
                }
            });

            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem("auth_token");
                sessionStorage.removeItem("auth_token");
                nav("/login");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch profile");
            }

            const data: UserProfile = await response.json();
            setProfileData(data);
            
            // Set form values
            profileForm.reset({
                full_name: data.full_name,
                username: data.username || "",
                email: data.email
            });

        } catch (error) {
            console.error("Error fetching profile:", error);
            notification.error({
                message: "Error",
                description: "No se pudo cargar el perfil. Por favor, intenta de nuevo."
            });
        } finally {
            setProfileLoading(false);
        }
    };

    // Build update payload only with changed fields
    const buildProfileUpdatePayload = (values: ProfileFormData) => {
        if (!profileData) return {} as Record<string, unknown>;
        const payload: Record<string, unknown> = {};
        const currentUsername = profileData.username ?? "";
        if (values.full_name !== profileData.full_name) payload.full_name = values.full_name;
        if (values.email !== profileData.email) payload.email = values.email;
        if (values.username !== currentUsername) payload.username = values.username === "" ? null : values.username;
        return payload;
    };

    // Update profile
    const handleProfileUpdate = async (data: ProfileFormData) => {
        try {
            setLoading(true);
            const token = getAuthToken();
            if (!token) {
                throw new Error("No authentication token found");
            }
            
            const payload = buildProfileUpdatePayload(data);

            const url = `${apiBase()}/v1/auth/me`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Authorization": token, // token already includes "Bearer "
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to update profile");
            }

            const updatedProfile: UserProfile = await response.json();
            setProfileData(updatedProfile);
            
            // Reset form with updated data
            profileForm.reset({
                full_name: updatedProfile.full_name,
                username: updatedProfile.username || "",
                email: updatedProfile.email
            });
            
            notification.success({
                message: "Perfil actualizado",
                description: "Tu información de perfil ha sido actualizada exitosamente."
            });

        } catch (error) {
            console.error("Error updating profile:", error);
            notification.error({
                message: "Error al actualizar",
                description: error instanceof Error ? error.message : "No se pudo actualizar el perfil."
            });
        } finally {
            setLoading(false);
        }
    };

    // Update password (validation handled by zod schema)
    const handlePasswordUpdate = async (data: PasswordFormData) => {
        try {
            setLoading(true);
            const token = getAuthToken();
            if (!token) {
                throw new Error("No authentication token found");
            }

            const url = `${apiBase()}/v1/auth/me`;
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Authorization": token, // token already includes "Bearer "
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    current_password: data.current_password,
                    new_password: data.new_password
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to update password");
            }

            // Reset password form
            passwordForm.reset();
            
            notification.success({
                message: "Contraseña actualizada",
                description: "Tu contraseña ha sido actualizada exitosamente."
            });

        } catch (error) {
            console.error("Error updating password:", error);
            notification.error({
                message: "Error al actualizar contraseña",
                description: error instanceof Error ? error.message : "No se pudo actualizar la contraseña."
            });
        } finally {
            setLoading(false);
        }
    };

    // Upload avatar
    const handleAvatarUpload = async () => {
        if (!avatarFile || !profileData) return;

        const formData = new FormData();
        formData.append("file", avatarFile as any);

        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = token;

        try {
            const res = await fetch(`${apiBase()}/v1/users/${profileData.id}/avatar`, {
                method: "POST",
                headers,
                body: formData,
            });

            if (!res.ok) throw new Error("Upload failed");

            antdMessage.success("Foto de perfil actualizada");
            await fetchProfile();
            setAvatarFile(null);
        } catch (error) {
            antdMessage.error("Error al subir foto");
        }
    };

    // Load profile on component mount
    useEffect(() => {
        fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect profile changes to enable update button
    const watched = profileForm.watch();
    const hasProfileChanges = (() => {
        if (!profileData) return false;
        const currentUsername = profileData.username ?? "";
        return (
            watched?.full_name !== profileData.full_name ||
            watched?.email !== profileData.email ||
            (watched?.username ?? "") !== currentUsername
        );
    })();

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma
                selectedKey={(pathname as CelumaKey) ?? "/profile"}
                onNavigate={(k) => nav(k)}
                logoSrc={logo}
            />

            <Layout.Content style={{ padding: 24, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                    input:-webkit-autofill,
                    input:-webkit-autofill:hover,
                    input:-webkit-autofill:focus {
                        -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
                        box-shadow: 0 0 0 1000px #ffffff inset !important;
                        -webkit-text-fill-color: #0d1b2a !important;
                    }
                `}</style>
                <div style={{ maxWidth: 1040, margin: "0 auto" }}>

                    {profileLoading ? (
                        <Card loading style={{ marginBottom: 24 }}>
                            <div style={{ height: 200 }} />
                        </Card>
                    ) : (
                        <>
                            {/* Grid responsive estilo GitHub */}
                            <style>{`
                                .profile-grid { 
                                    display: grid; 
                                    gap: 24px; 
                                    grid-template-columns: 1fr;
                                }
                                @media (min-width: 768px) { 
                                    .profile-grid { 
                                        grid-template-columns: 300px 1fr; 
                                    } 
                                }
                                @media (min-width: 1024px) { 
                                    .profile-grid { 
                                        grid-template-columns: 320px 1fr; 
                                    } 
                                }
                                
                                .profile-summary-card {
                                    order: 1;
                                }
                                .profile-forms-section {
                                    order: 2;
                                }
                                
                                @media (min-width: 768px) {
                                    .profile-summary-card {
                                        order: 0;
                                    }
                                    .profile-forms-section {
                                        order: 0;
                                    }
                                }
                            `}</style>
                            <div className="profile-grid">
                                {/* Columna izquierda: resumen */}
                                <div className="profile-summary-card">
                                    <Card
                                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Mi Perfil</span>}
                                        style={{ marginBottom: 24, borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                                    >
                                        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", marginBottom: 16 }}>
                                            <Avatar 
                                                size={96} 
                                                src={profileData?.avatar_url}
                                                style={{ background: "#0f8b8d", fontWeight: 800 }}
                                            >
                                                {profileData?.full_name?.[0]?.toUpperCase() || "U"}
                                            </Avatar>
                                            <Upload
                                                beforeUpload={(file) => {
                                                    setAvatarFile(file);
                                                    return false;
                                                }}
                                                fileList={avatarFile ? [avatarFile] : []}
                                                onRemove={() => setAvatarFile(null)}
                                                accept="image/*"
                                                maxCount={1}
                                                showUploadList={false}
                                            >
                                                <Button size="small" icon={<UploadOutlined />}>
                                                    Cambiar Foto
                                                </Button>
                                            </Upload>
                                            {avatarFile && (
                                                <Button 
                                                    type="primary" 
                                                    size="small"
                                                    onClick={handleAvatarUpload}
                                                >
                                                    Subir
                                                </Button>
                                            )}
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: "#0d1b2a" }}>{profileData?.full_name}</div>
                                                <div style={{ color: "#6b7280" }}>{profileData?.email}</div>
                                                <div style={{ color: "#6b7280", marginTop: 4 }}>Usuario: <span style={{ color: "#0d1b2a", fontWeight: 600 }}>{profileData?.username ?? "—"}</span></div>
                                                <div style={{ color: "#6b7280", marginTop: 2 }}>Rol: <span style={{ color: "#0d1b2a", fontWeight: 600 }}>{profileData?.role}</span></div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 16 }}>
                                            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>Tenant</div>
                                            <div style={{ wordBreak: "break-all" }}>{profileData?.tenant_id}</div>
                                        </div>
                                    </Card>
                                </div>

                                {/* Columna derecha: formularios */}
                                <div className="profile-forms-section">
                                    {/* Información del perfil */}
                                    <Card 
                                        title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Información del Perfil</span>} 
                                        style={{ marginBottom: 24, borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}
                                        extra={
                                            profileData && (
                                                <span style={{ color: "#6b7280", fontSize: 14 }}>
                                                    Rol: {profileData.role}
                                                </span>
                                            )
                                        }
                                    >
                                        <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)}>
                                            <div style={{ display: "grid", gap: 16 }}>
                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Nombre completo *
                                                    </label>
                                                    <FormField
                                                        control={profileForm.control}
                                                        name="full_name"
                                                        render={({ value, onChange, error }) => (
                                                            <TextField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<UserOutlined />}
                                                                placeholder="Ingresa tu nombre completo"
                                                                disabled={loading}
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Nombre de usuario
                                                    </label>
                                                    <FormField
                                                        control={profileForm.control}
                                                        name="username"
                                                        render={({ value, onChange, error }) => (
                                                            <TextField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<UserOutlined />}
                                                                placeholder="Nombre de usuario (opcional)"
                                                                disabled={loading}
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Correo electrónico *
                                                    </label>
                                                    <FormField
                                                        control={profileForm.control}
                                                        name="email"
                                                        render={({ value, onChange, error }) => (
                                                            <TextField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<MailOutlined />}
                                                                placeholder="tu@correo.com"
                                                                disabled={loading}
                                                                type="email"
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <Button
                                                    type="primary"
                                                    htmlType="submit"
                                                    loading={loading}
                                                    disabled={!hasProfileChanges || loading}
                                                    style={{ marginTop: 8 }}
                                                >
                                                    Actualizar Información
                                                </Button>
                                            </div>
                                        </form>
                                    </Card>

                                    {/* Cambiar contraseña */}
                                    <Card title={<span style={{ fontFamily: tokens.titleFont, fontSize: 20, fontWeight: 800, color: "#0d1b2a" }}>Cambiar Contraseña</span>} style={{ borderRadius: tokens.radius, boxShadow: tokens.shadow, background: tokens.cardBg }}>
                                        <form onSubmit={passwordForm.handleSubmit(handlePasswordUpdate)}>
                                            <div style={{ display: "grid", gap: 16 }}>
                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Contraseña actual *
                                                    </label>
                                                    <FormField
                                                        control={passwordForm.control}
                                                        name="current_password"
                                                        render={({ value, onChange, error }) => (
                                                            <PasswordField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<KeyOutlined />}
                                                                placeholder="Ingresa tu contraseña actual"
                                                                disabled={loading}
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Nueva contraseña *
                                                    </label>
                                                    <FormField
                                                        control={passwordForm.control}
                                                        name="new_password"
                                                        render={({ value, onChange, error }) => (
                                                            <PasswordField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<KeyOutlined />}
                                                                placeholder="Ingresa tu nueva contraseña"
                                                                disabled={loading}
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <div>
                                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>
                                                        Confirmar nueva contraseña *
                                                    </label>
                                                    <FormField
                                                        control={passwordForm.control}
                                                        name="confirm_password"
                                                        render={({ value, onChange, error }) => (
                                                            <PasswordField
                                                                value={value}
                                                                onChange={onChange}
                                                                error={error}
                                                                prefixNode={<KeyOutlined />}
                                                                placeholder="Confirma tu nueva contraseña"
                                                                disabled={loading}
                                                            />
                                                        )}
                                                    />
                                                </div>

                                                <Button
                                                    type="primary"
                                                    htmlType="submit"
                                                    loading={loading}
                                                    style={{ marginTop: 8 }}
                                                >
                                                    Cambiar Contraseña
                                                </Button>
                                            </div>
                                        </form>
                                    </Card>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Profile;
