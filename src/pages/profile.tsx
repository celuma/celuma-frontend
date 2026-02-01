import { useState, useEffect } from "react";
import { Layout, Card, notification, Avatar, Upload, message as antdMessage, Tag, Divider } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UserOutlined, MailOutlined, KeyOutlined, UploadOutlined, CameraOutlined, IdcardOutlined } from "@ant-design/icons";
import SidebarCeluma from "../components/ui/sidebar_menu";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import Button from "../components/ui/button";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { RcFile } from "antd/es/upload/interface";
import { usePageTitle } from "../hooks/use_page_title";

interface UserProfile {
    id: string;
    email: string;
    username: string | null;
    full_name: string;
    role: string;
    tenant_id: string;
    avatar_url?: string;
}

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
            "Debe contener mayúscula, minúscula, número y símbolo."
        ),
    confirm_password: z.string().nonempty("Confirmar contraseña es obligatorio."),
}).refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm_password"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const getInitials = (fullName?: string | null): string => {
    if (!fullName) return "U";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "U";
    return (parts[0][0]?.toUpperCase() || "") + (parts[parts.length - 1][0]?.toUpperCase() || "");
};

const getAvatarColor = (name: string): string => {
    const colors = ["#0f8b8d", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#6366f1"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

const getRoleDisplayName = (role: string): string => {
    const roleNames: Record<string, string> = {
        "admin": "Administrador",
        "pathologist": "Patólogo",
        "technician": "Técnico",
        "receptionist": "Recepcionista",
        "billing": "Facturación",
    };
    return roleNames[role.toLowerCase()] || role;
};

const Profile: React.FC = () => {
    usePageTitle();
    const nav = useNavigate();
    const { pathname } = useLocation();
    const [loading, setLoading] = useState(false);
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [avatarFile, setAvatarFile] = useState<RcFile | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarHover, setAvatarHover] = useState(false);

    const createSDRPreview = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
                if (!ctx) { reject(new Error("Canvas not supported")); return; }
                const maxSize = 256;
                let width = img.width, height = img.height;
                if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
                else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.9));
            };
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = URL.createObjectURL(file);
        });
    };

    const profileForm = useForm<ProfileFormData>({ resolver: zodResolver(profileSchema), mode: "onChange" });
    const passwordForm = useForm<PasswordFormData>({
        resolver: zodResolver(passwordSchema),
        mode: "onChange",
        defaultValues: { current_password: "", new_password: "", confirm_password: "" },
    });

    const apiBase = () => import.meta.env.DEV ? "/api" : (import.meta.env.VITE_API_BASE_URL || "/api");
    const getAuthToken = () => localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
        
    const fetchProfile = async () => {
        try {
            setProfileLoading(true);
            const token = getAuthToken();
            if (!token) { nav("/login"); return; }
            const response = await fetch(`${apiBase()}/v1/auth/me`, {
                headers: { "Authorization": token, "Content-Type": "application/json" }
            });
            if (response.status === 401) {
                localStorage.removeItem("auth_token");
                sessionStorage.removeItem("auth_token");
                nav("/login");
                return;
            }
            if (!response.ok) throw new Error("Failed to fetch profile");
            const data: UserProfile = await response.json();
            setProfileData(data);
            profileForm.reset({ full_name: data.full_name, username: data.username || "", email: data.email });
        } catch (error) {
            console.error("Error fetching profile:", error);
            notification.error({ message: "Error", description: "No se pudo cargar el perfil." });
        } finally {
            setProfileLoading(false);
        }
    };

    const buildProfileUpdatePayload = (values: ProfileFormData) => {
        if (!profileData) return {};
        const payload: Record<string, unknown> = {};
        if (values.full_name !== profileData.full_name) payload.full_name = values.full_name;
        if (values.email !== profileData.email) payload.email = values.email;
        if (values.username !== (profileData.username ?? "")) payload.username = values.username === "" ? null : values.username;
        return payload;
    };

    const handleProfileUpdate = async (data: ProfileFormData) => {
        try {
            setLoading(true);
            const token = getAuthToken();
            if (!token) throw new Error("No authentication token found");
            const response = await fetch(`${apiBase()}/v1/auth/me`, {
                method: "PUT",
                headers: { "Authorization": token, "Content-Type": "application/json" },
                body: JSON.stringify(buildProfileUpdatePayload(data))
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to update profile");
            }
            const updatedProfile: UserProfile = await response.json();
            setProfileData(updatedProfile);
            profileForm.reset({ full_name: updatedProfile.full_name, username: updatedProfile.username || "", email: updatedProfile.email });
            notification.success({ message: "Perfil actualizado", description: "Tu información ha sido actualizada." });
        } catch (error) {
            notification.error({ message: "Error", description: error instanceof Error ? error.message : "No se pudo actualizar." });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUpdate = async (data: PasswordFormData) => {
        try {
            setLoading(true);
            const token = getAuthToken();
            if (!token) throw new Error("No authentication token found");
            const response = await fetch(`${apiBase()}/v1/auth/me`, {
                method: "PUT",
                headers: { "Authorization": token, "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to update password");
            }
            passwordForm.reset();
            notification.success({ message: "Contraseña actualizada", description: "Tu contraseña ha sido cambiada." });
        } catch (error) {
            notification.error({ message: "Error", description: error instanceof Error ? error.message : "No se pudo actualizar." });
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarSelect = async (file: RcFile) => {
        if (!file.type.startsWith("image/")) { antdMessage.error("Solo se permiten imágenes"); return false; }
        if (file.size / 1024 / 1024 >= 5) { antdMessage.error("Máximo 5MB"); return false; }
        setAvatarFile(file);
        try { setAvatarPreview(await createSDRPreview(file)); } catch { setAvatarPreview(null); }
        return false;
    };

    const handleClearAvatarSelection = () => { setAvatarFile(null); setAvatarPreview(null); };

    const handleAvatarUpload = async () => {
        if (!avatarFile || !profileData) return;
        setUploadingAvatar(true);
        const formData = new FormData();
        formData.append("file", avatarFile);
        const token = getAuthToken();
        try {
            const res = await fetch(`${apiBase()}/v1/users/${profileData.id}/avatar`, {
                method: "POST",
                headers: token ? { "Authorization": token } : {},
                body: formData,
            });
            if (!res.ok) throw new Error("Upload failed");
            antdMessage.success("Foto actualizada");
            handleClearAvatarSelection();
            await fetchProfile();
        } catch (err) {
            antdMessage.error(err instanceof Error ? err.message : "Error al subir foto");
        } finally {
            setUploadingAvatar(false);
        }
    };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchProfile(); }, []);

    const watched = profileForm.watch();
    const hasProfileChanges = profileData && (
            watched?.full_name !== profileData.full_name ||
            watched?.email !== profileData.email ||
        (watched?.username ?? "") !== (profileData.username ?? "")
        );

    const initials = getInitials(profileData?.full_name);
    const avatarColor = getAvatarColor(profileData?.full_name || "User");

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/profile"} onNavigate={(k) => nav(k)} logoSrc={logo} />

            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <style>{`
                    input:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px #fff inset !important; -webkit-text-fill-color: #0d1b2a !important; }
                    .profile-header { display: flex; align-items: flex-start; gap: 32px; }
                    .profile-avatar-section { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
                    .profile-info-section { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
                    .profile-details { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 12px; }
                    @media (max-width: 640px) {
                        .profile-header { flex-direction: column; align-items: center; text-align: center; }
                        .profile-info-section { align-items: center; }
                        .profile-details { justify-content: center; }
                    }
                    .avatar-container { position: relative; cursor: pointer; }
                    .avatar-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
                    .avatar-container:hover .avatar-overlay { opacity: 1; }
                `}</style>

                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto", display: "grid", gap: tokens.gap }}>
                    {/* Profile Header Card */}
                    <Card style={cardStyle} loading={profileLoading}>
                        {!profileLoading && profileData && (
                            <div className="profile-header">
                                {/* Avatar Section */}
                                <div className="profile-avatar-section">
                                    <div 
                                        className="avatar-container"
                                        onMouseEnter={() => setAvatarHover(true)}
                                        onMouseLeave={() => setAvatarHover(false)}
                                    >
                                            <Avatar 
                                            size={140}
                                            src={avatarPreview || profileData.avatar_url}
                                            style={{
                                                backgroundColor: (avatarPreview || profileData.avatar_url) ? "transparent" : avatarColor,
                                                fontSize: 52,
                                                fontWeight: 700,
                                                border: avatarPreview ? `3px solid ${tokens.primary}` : "3px solid #e5e7eb",
                                            }}
                                            >
                                            {initials}
                                            </Avatar>
                                        {!avatarFile && (
                                            <Upload
                                                beforeUpload={handleAvatarSelect}
                                                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                                                maxCount={1}
                                                showUploadList={false}
                                            >
                                                <div className="avatar-overlay" style={{ opacity: avatarHover ? 1 : 0 }}>
                                                    <CameraOutlined style={{ color: "#fff", fontSize: 28 }} />
                                                </div>
                                            </Upload>
                                        )}
                                    </div>
                                    
                                            {avatarFile && (
                                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                                            <Button type="primary" size="small" onClick={handleAvatarUpload} loading={uploadingAvatar} icon={<UploadOutlined />}>
                                                Guardar
                                            </Button>
                                            <Button size="small" onClick={handleClearAvatarSelection} disabled={uploadingAvatar}>
                                                Cancelar
                                                </Button>
                                        </div>
                                    )}

                                    <h1 style={{ margin: "16px 0 0 0", fontFamily: tokens.titleFont, fontSize: 24, fontWeight: 800, color: tokens.textPrimary }}>
                                        {profileData.full_name}
                                    </h1>
                                    {profileData.username && (
                                        <div style={{ color: tokens.textSecondary, fontSize: 15 }}>@{profileData.username}</div>
                                    )}
                                            </div>

                                {/* Info Section */}
                                <div className="profile-info-section">
                                    <div className="profile-details">
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                            <MailOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                            <span>{profileData.email}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: tokens.textSecondary }}>
                                            <IdcardOutlined style={{ fontSize: 16, color: tokens.primary }} />
                                            <span style={{ fontSize: 13, wordBreak: "break-all" }}>{profileData.tenant_id}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Profile Edit Card */}
                                    <Card 
                        title={<span style={cardTitleStyle}>Editar Información</span>}
                        style={cardStyle}
                                        extra={
                                            profileData && (
                                <Tag color={tokens.primary} style={{ fontSize: 13, padding: "4px 12px" }}>
                                    {getRoleDisplayName(profileData.role)}
                                </Tag>
                                            )
                                        }
                                    >
                                        <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)}>
                            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nombre completo *</label>
                                    <FormField control={profileForm.control} name="full_name" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<UserOutlined />} label="Nombre completo" disabled={loading} />
                                    )} />
                                                </div>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nombre de usuario</label>
                                    <FormField control={profileForm.control} name="username" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<UserOutlined />} label="Nombre de usuario (opcional)" disabled={loading} />
                                    )} />
                                                </div>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Correo electrónico *</label>
                                    <FormField control={profileForm.control} name="email" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<MailOutlined />} label="Correo electrónico" disabled={loading} type="email" />
                                    )} />
                                </div>
                                                </div>
                            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                <Button type="primary" htmlType="submit" loading={loading} disabled={!hasProfileChanges || loading}>
                                    Guardar Cambios
                                                </Button>
                                            </div>
                                        </form>

                        {/* Password Change Section */}
                        <Divider style={{ margin: "32px 0 24px 0" }} />
                        
                        <div>
                            <h3 style={{ 
                                margin: "0 0 20px 0", 
                                fontFamily: tokens.titleFont, 
                                fontSize: 18, 
                                fontWeight: 700, 
                                color: tokens.textPrimary,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                            }}>
                                <KeyOutlined style={{ color: tokens.primary }} />
                                Cambiar Contraseña
                            </h3>
                            
                                        <form onSubmit={passwordForm.handleSubmit(handlePasswordUpdate)}>
                                <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                                                <div>
                                        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Contraseña actual *</label>
                                        <FormField control={passwordForm.control} name="current_password" render={({ value, onChange, error }) => (
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Contraseña actual" disabled={loading} />
                                        )} />
                                                </div>
                                                <div>
                                        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nueva contraseña *</label>
                                        <FormField control={passwordForm.control} name="new_password" render={({ value, onChange, error }) => (
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Nueva contraseña" disabled={loading} />
                                        )} />
                                                </div>
                                                <div>
                                        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Confirmar contraseña *</label>
                                        <FormField control={passwordForm.control} name="confirm_password" render={({ value, onChange, error }) => (
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Confirmar contraseña" disabled={loading} />
                                        )} />
                                    </div>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 12, color: tokens.textSecondary }}>
                                    Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo (!@#$%^&*).
                                                </div>
                                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                                    <Button type="primary" htmlType="submit" loading={loading}>
                                                    Cambiar Contraseña
                                                </Button>
                                            </div>
                                        </form>
                        </div>
                                    </Card>
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Profile;
