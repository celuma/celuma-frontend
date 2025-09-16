import { useState, useEffect } from "react";
import { Layout, Card, notification, Avatar } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { UserOutlined, MailOutlined, KeyOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import FormField from "../components/ui/form_field";
import TextField from "../components/ui/text_field";
import PasswordField from "../components/ui/password_field";
import Button from "../components/ui/button";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";

// Types for the API responses and form data
interface UserProfile {
    id: string;
    email: string;
    username: string | null;
    full_name: string;
    role: string;
    tenant_id: string;
}

interface ProfileFormData {
    full_name: string;
    username: string;
    email: string;
}

interface PasswordFormData {
    current_password: string;
    new_password: string;
    confirm_password: string;
}

const Profile: React.FC = () => {
    const nav = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);

    // Forms for profile and password update
    const profileForm = useForm<ProfileFormData>();
    const passwordForm = useForm<PasswordFormData>();

    // API Base URL - consistent with login.tsx approach
    const apiBase = () => {
        return import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
    };
    
    console.log("API_BASE configured as:", apiBase());
    console.log("Available env vars:", import.meta.env);
    console.log("DEV mode:", import.meta.env.DEV);

    // Get auth token from localStorage with debugging
    const getAuthToken = () => {
        const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
        console.log("Token found in localStorage:", localStorage.getItem("auth_token") ? "Yes" : "No");
        console.log("Token found in sessionStorage:", sessionStorage.getItem("auth_token") ? "Yes" : "No");
        console.log("Final token:", token ? `${token.substring(0, 20)}...` : "No token");
        return token;
    };

    // Fetch current user profile 
    const fetchProfile = async () => {
        try {
            setProfileLoading(true);
            const token = getAuthToken();
            
            console.log("Token found:", token ? "Yes" : "No");
            
            if (!token) {
                nav("/login");
                return;
            }

            const url = `${apiBase()}/v1/auth/me`;
            console.log("Fetching profile from:", url);

            const response = await fetch(url, {
                headers: {
                    "Authorization": token, // token already includes "Bearer "
                    "Content-Type": "application/json"
                }
            });

            console.log("Response status:", response.status);
            console.log("Response headers:", Object.fromEntries(response.headers.entries()));

            if (response.status === 401) {
                console.log("Token expired or invalid, redirecting to login");
                localStorage.removeItem("auth_token");
                sessionStorage.removeItem("auth_token");
                nav("/login");
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Profile fetch failed:", response.status, errorText);
                throw new Error(`Failed to fetch profile: ${response.status} ${errorText}`);
            }

            const data: UserProfile = await response.json();
            console.log("Profile data received:", data);
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
            console.log("Updating profile at:", url, "with payload:", payload);
            
            const response = await fetch(url, {
                method: "PUT",
                headers: {
                    "Authorization": token, // token already includes "Bearer "
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            console.log("Update response status:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Profile update failed:", response.status, errorText);
                let errorMsg = "Failed to update profile";
                try {
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.detail || errorMsg;
                } catch {
                    errorMsg = errorText || errorMsg;
                }
                throw new Error(errorMsg);
            }

            const updatedProfile: UserProfile = await response.json();
            console.log("Profile updated successfully:", updatedProfile);
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

    // Update password
    const handlePasswordUpdate = async (data: PasswordFormData) => {
        if (data.new_password !== data.confirm_password) {
            notification.error({
                message: "Error",
                description: "Las contraseñas no coinciden."
            });
            return;
        }

        try {
            setLoading(true);
            const token = getAuthToken();
            if (!token) {
                throw new Error("No authentication token found");
            }

            const url = `${apiBase()}/v1/auth/me`;
            console.log("Updating password at:", url);
            
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

            console.log("Password update response status:", response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Password update failed:", response.status, errorText);
                let errorMsg = "Failed to update password";
                try {
                    const errorData = JSON.parse(errorText);
                    errorMsg = errorData.detail || errorMsg;
                } catch {
                    errorMsg = errorText || errorMsg;
                }
                throw new Error(errorMsg);
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

    // Load profile on component mount
    useEffect(() => {
        fetchProfile();
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

            <Layout.Content style={{ padding: 24, background: "#f6f8fa" }}>
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
                    <h1 style={{ marginBottom: 24, color: "#0d1b2a" }}>Mi Perfil</h1>

                    {profileLoading ? (
                        <Card loading style={{ marginBottom: 24 }}>
                            <div style={{ height: 200 }} />
                        </Card>
                    ) : (
                        <>
                            {/* Grid responsive estilo GitHub */}
                            <style>{`
                                .profile-grid { display: grid; gap: 24px; }
                                @media (min-width: 1024px) { .profile-grid { grid-template-columns: 320px 1fr; } }
                            `}</style>
                            <div className="profile-grid">
                                {/* Columna izquierda: resumen */}
                                <div>
                                    <Card style={{ marginBottom: 24 }}>
                                        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                                            <Avatar size={64} style={{ background: "#0f8b8d", fontWeight: 800 }}>
                                                {profileData?.full_name?.[0]?.toUpperCase() || "U"}
                                            </Avatar>
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
                                <div>
                                    {/* Información del perfil */}
                                    <Card 
                                        title="Información del Perfil" 
                                        style={{ marginBottom: 24 }}
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
                                    <Card title="Cambiar Contraseña">
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
