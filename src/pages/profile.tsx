import { useState, useEffect, useRef } from "react";
import { Layout, Card, Avatar, Upload, Divider, Popconfirm, Button as AntButton, Tooltip } from "antd";
import { showCelumaSuccess, showCelumaWarning, showCelumaApiError } from "../lib/celuma_feedback";
import { formatHttpError } from "../lib/api_error";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
    UserOutlined, MailOutlined, KeyOutlined, UploadOutlined, CameraOutlined,
    IdcardOutlined, SafetyCertificateOutlined, DeleteOutlined, PlusOutlined,
} from "@ant-design/icons";
import {
    uploadSignature, getSignature, deleteSignature,
    NO_SIGNATURE_TITLE, NO_SIGNATURE_DESCRIPTION, isSignatureMissingError,
} from "../services/signature_service";
import SidebarCeluma from "../components/ui/sidebar_menu";
import FormField from "../components/ui/form_field";
import FloatingCaptionInput from "../components/ui/floating_caption_input";
import PasswordField from "../components/ui/password_field";
import Button from "../components/ui/button";
import type { CelumaKey } from "../components/ui/sidebar_menu";
import logo from "../images/celuma-isotipo.png";
import { tokens, cardTitleStyle, cardStyle } from "../components/design/tokens";
import type { RcFile } from "antd/es/upload/interface";
import { usePageTitle } from "../hooks/use_page_title";
import { roleDisplayName, roleColor } from "../lib/rbac";

interface UserProfile {
    id: string;
    email: string;
    username: string | null;
    full_name: string;
    roles: string[];
    permissions: string[];
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

interface ProfileProps {
    embedded?: boolean;
}

const Profile: React.FC<ProfileProps> = ({ embedded = false }) => {
    usePageTitle();
    const nav = useNavigate();
    const { pathname } = useLocation();
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [profileData, setProfileData] = useState<UserProfile | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);
    const [avatarFile, setAvatarFile] = useState<RcFile | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarHover, setAvatarHover] = useState(false);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [signatureKey, setSignatureKey] = useState(0);
    const [loadingSignature, setLoadingSignature] = useState(false);
    const [uploadingSignature, setUploadingSignature] = useState(false);
    const [deletingSignature, setDeletingSignature] = useState(false);
    const signatureInputRef = useRef<HTMLInputElement | null>(null);
    // Avoid spamming the "no signature yet" warning on re-renders / refetches.
    const noSignatureHintShownRef = useRef(false);

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
            showCelumaApiError(error, "No se pudo cargar el perfil.");
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
            setSavingProfile(true);
            const token = getAuthToken();
            if (!token) throw new Error("No authentication token found");
            const response = await fetch(`${apiBase()}/v1/auth/me`, {
                method: "PUT",
                headers: { "Authorization": token, "Content-Type": "application/json" },
                body: JSON.stringify(buildProfileUpdatePayload(data))
            });
            if (!response.ok) {
                const bodyText = await response.text();
                throw new Error(formatHttpError(response.status, bodyText));
            }
            const updatedProfile: UserProfile = await response.json();
            setProfileData(updatedProfile);
            profileForm.reset({ full_name: updatedProfile.full_name, username: updatedProfile.username || "", email: updatedProfile.email });
            showCelumaSuccess("Perfil actualizado", "Tu información ha sido guardada correctamente.");
        } catch (error) {
            showCelumaApiError(error, "No se pudo actualizar el perfil.");
        } finally {
            setSavingProfile(false);
        }
    };

    const handlePasswordUpdate = async (data: PasswordFormData) => {
        try {
            setSavingPassword(true);
            const token = getAuthToken();
            if (!token) throw new Error("No authentication token found");
            const response = await fetch(`${apiBase()}/v1/auth/me`, {
                method: "PUT",
                headers: { "Authorization": token, "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password })
            });
            if (!response.ok) {
                const bodyText = await response.text();
                const msg = formatHttpError(response.status, bodyText);
                if (response.status === 400 && bodyText.includes("Current password is incorrect")) {
                    showCelumaWarning("Contraseña incorrecta", "La contraseña actual que ingresaste no es correcta.");
                } else {
                    throw new Error(msg);
                }
                return;
            }
            passwordForm.reset();
            showCelumaSuccess("Contraseña actualizada", "Tu contraseña ha sido cambiada correctamente.");
        } catch (error) {
            showCelumaApiError(error, "No se pudo actualizar la contraseña.");
        } finally {
            setSavingPassword(false);
        }
    };

    const handleAvatarSelect = async (file: RcFile) => {
        if (!file.type.startsWith("image/")) { showCelumaWarning("Tipo de archivo no permitido", "Solo se permiten imágenes."); return false; }
        if (file.size / 1024 / 1024 >= 5) { showCelumaWarning("Archivo demasiado grande", "El archivo no puede superar 5 MB."); return false; }
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
            showCelumaSuccess("Foto actualizada", "Tu foto de perfil ha sido guardada.");
            handleClearAvatarSelection();
            await fetchProfile();
        } catch (err) {
            showCelumaApiError(err, "Error al subir la foto de perfil.");
        } finally {
            setUploadingAvatar(false);
        }
    };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchProfile(); }, []);

    useEffect(() => {
        if (!profileData) return;
        if (!profileData.roles.includes("reviewer")) {
            setSignatureUrl(null);
            return;
        }
        let cancelled = false;
        const loadSignature = async () => {
            setLoadingSignature(true);
            try {
                const sig = await getSignature();
                if (cancelled) return;
                if (sig?.url) {
                    setSignatureUrl(sig.url);
                    setSignatureKey((k) => k + 1);
                    return;
                }
                setSignatureUrl(null);
                if (!noSignatureHintShownRef.current) {
                    noSignatureHintShownRef.current = true;
                    showCelumaWarning(NO_SIGNATURE_TITLE, NO_SIGNATURE_DESCRIPTION);
                }
            } catch (error) {
                if (cancelled) return;
                setSignatureUrl(null);
                if (isSignatureMissingError(error)) {
                    if (!noSignatureHintShownRef.current) {
                        noSignatureHintShownRef.current = true;
                        showCelumaWarning(NO_SIGNATURE_TITLE, NO_SIGNATURE_DESCRIPTION);
                    }
                    return;
                }
                showCelumaApiError(error, "No se pudo cargar la firma digital.");
            } finally {
                if (!cancelled) setLoadingSignature(false);
            }
        };
        loadSignature();
        return () => { cancelled = true; };
    }, [profileData]);

    const handleSignatureFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        // Reset the input so selecting the same file again still triggers onChange
        event.target.value = "";
        if (!file) return;

        if (file.type !== "image/png") {
            showCelumaWarning("Tipo no permitido", "Solo se aceptan archivos PNG para la firma digital.");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showCelumaWarning("Archivo demasiado grande", "La firma no puede superar 2 MB.");
            return;
        }

        setUploadingSignature(true);
        try {
            const sig = await uploadSignature(file);
            // Bump key so React remounts the <img> tag and bypasses any browser
            // cache when the user replaces an existing signature.
            setSignatureUrl(sig.url);
            setSignatureKey((k) => k + 1);
            // Once the user has a signature, the "missing" warning is no longer
            // relevant; if they later delete it, surface the hint again.
            noSignatureHintShownRef.current = false;
            showCelumaSuccess("Firma actualizada", "Tu firma digital ha sido guardada correctamente.");
        } catch (error) {
            showCelumaApiError(error, "No se pudo subir la firma digital.");
        } finally {
            setUploadingSignature(false);
        }
    };

    const handleDeleteSignature = async () => {
        setDeletingSignature(true);
        try {
            await deleteSignature();
            setSignatureUrl(null);
            showCelumaSuccess("Firma eliminada", "Tu firma digital fue eliminada.");
        } catch (error) {
            showCelumaApiError(error, "No se pudo eliminar la firma digital.");
        } finally {
            setDeletingSignature(false);
        }
    };

    const triggerSignatureUpload = () => {
        signatureInputRef.current?.click();
    };

    const watched = profileForm.watch();
    const hasProfileChanges = profileData && (
            watched?.full_name !== profileData.full_name ||
            watched?.email !== profileData.email ||
        (watched?.username ?? "") !== (profileData.username ?? "")
        );

    const initials = getInitials(profileData?.full_name);
    const avatarColor = getAvatarColor(profileData?.full_name || "User");

    const content = (
        <div style={{ display: "grid", gap: tokens.gap }}>
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
                .sig-preview-wrap { position: relative; }
                .sig-delete-overlay {
                    position: absolute; top: 0; left: 0; right: 0; height: 160px;
                    background: rgba(0, 0, 0, 0.45);
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; cursor: pointer;
                    transition: opacity 0.2s ease;
                }
                .sig-preview-wrap:hover .sig-delete-overlay { opacity: 1; }
            `}</style>
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
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {profileData.roles.map((r) => {
                                        const { color, bg } = roleColor(r);
                                        return (
                                            <span
                                                key={r}
                                                style={{
                                                    backgroundColor: bg,
                                                    color,
                                                    borderRadius: 12,
                                                    fontSize: 12,
                                                    fontWeight: 500,
                                                    padding: "4px 12px",
                                                }}
                                            >
                                                {roleDisplayName(r)}
                                            </span>
                                        );
                                    })}
                                </div>
                            )
                        }
                    >
                                        <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)}>
                            <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nombre completo *</label>
                                    <FormField control={profileForm.control} name="full_name" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<UserOutlined />} label="Nombre completo" disabled={savingProfile} />
                                    )} />
                                                </div>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nombre de usuario</label>
                                    <FormField control={profileForm.control} name="username" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<UserOutlined />} label="Nombre de usuario (opcional)" disabled={savingProfile} />
                                    )} />
                                                </div>
                                                <div>
                                    <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Correo electrónico *</label>
                                    <FormField control={profileForm.control} name="email" render={({ value, onChange, error }) => (
                                        <FloatingCaptionInput value={value} onChange={onChange} error={error} prefixNode={<MailOutlined />} label="Correo electrónico" disabled={savingProfile} type="email" />
                                    )} />
                                </div>
                                                </div>
                            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                <Button type="primary" htmlType="submit" loading={savingProfile} disabled={!hasProfileChanges || savingProfile}>
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
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Contraseña actual" disabled={savingPassword} />
                                        )} />
                                                </div>
                                                <div>
                                        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Nueva contraseña *</label>
                                        <FormField control={passwordForm.control} name="new_password" render={({ value, onChange, error }) => (
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Nueva contraseña" disabled={savingPassword} />
                                        )} />
                                                </div>
                                                <div>
                                        <label style={{ display: "block", marginBottom: 8, fontWeight: 600, color: "#374151" }}>Confirmar contraseña *</label>
                                        <FormField control={passwordForm.control} name="confirm_password" render={({ value, onChange, error }) => (
                                            <PasswordField value={value} onChange={onChange} error={error} prefixNode={<KeyOutlined />} placeholder="Confirmar contraseña" disabled={savingPassword} />
                                        )} />
                                    </div>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 12, color: tokens.textSecondary }}>
                                    Mínimo 8 caracteres con mayúscula, minúscula, número y símbolo (!@#$%^&*).
                                                </div>
                                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                                    <Button type="primary" htmlType="submit" loading={savingPassword}>
                                                    Cambiar Contraseña
                                                </Button>
                                            </div>
                                        </form>
                        </div>
                                    </Card>

                    {/* Digital Signature Card — only for users with the reviewer role */}
                    {profileData?.roles.includes("reviewer") && (
                        <Card
                            title={
                                <span style={cardTitleStyle}>
                                    <SafetyCertificateOutlined style={{ color: tokens.primary, marginRight: 8 }} />
                                    Firma Digital
                                </span>
                            }
                            style={cardStyle}
                            loading={loadingSignature}
                        >
                            <p style={{ marginTop: 0, marginBottom: 16, color: tokens.textSecondary, fontSize: 13 }}>
                                Esta firma se inserta automáticamente en los informes que firmes
                                como revisor cuando la plantilla así lo requiera.
                            </p>

                            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
                                {signatureUrl ? (
                                    /* Filled state — gallery-style card with hover overlay + compact footer */
                                    <div
                                        className="sig-preview-wrap"
                                        style={{
                                            position: "relative",
                                            width: 320,
                                            borderRadius: tokens.radius,
                                            overflow: "hidden",
                                            border: "1px solid #e5e7eb",
                                            background: "#fff",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {/* Image area with checkered background to evidence transparency */}
                                        <div
                                            style={{
                                                width: "100%",
                                                height: 160,
                                                backgroundImage: `
                                                    linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
                                                    linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
                                                    linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
                                                    linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)
                                                `,
                                                backgroundSize: "16px 16px",
                                                backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                                                backgroundColor: "#f9fafb",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                padding: 12,
                                            }}
                                        >
                                            <img
                                                key={signatureKey}
                                                src={signatureUrl}
                                                alt="Firma digital del usuario"
                                                style={{
                                                    maxWidth: "100%",
                                                    maxHeight: "100%",
                                                    objectFit: "contain",
                                                }}
                                            />
                                        </div>

                                        {/* Hover overlay with delete action */}
                                        <Popconfirm
                                            title="Eliminar firma digital"
                                            description="¿Estás seguro? No podrás firmar informes que requieran imagen digital hasta que cargues una nueva."
                                            okText="Eliminar"
                                            cancelText="Cancelar"
                                            okButtonProps={{ danger: true, loading: deletingSignature }}
                                            onConfirm={handleDeleteSignature}
                                            disabled={uploadingSignature}
                                        >
                                            <div className="sig-delete-overlay" title="Eliminar firma">
                                                <DeleteOutlined style={{ color: "#fff", fontSize: 22 }} />
                                            </div>
                                        </Popconfirm>

                                        {/* Compact footer — status pill + small icon action (matches sample gallery footer) */}
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "8px 10px",
                                                gap: 6,
                                                borderTop: "1px solid #f0f0f0",
                                                background: "#fff",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    color: "#10b981",
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    background: "#ecfdf5",
                                                    padding: "2px 8px",
                                                    borderRadius: 8,
                                                }}
                                            >
                                                Firma cargada
                                            </span>
                                            <Tooltip title="Reemplazar firma">
                                                <AntButton
                                                    size="small"
                                                    type="text"
                                                    icon={<UploadOutlined />}
                                                    onClick={triggerSignatureUpload}
                                                    loading={uploadingSignature}
                                                    disabled={uploadingSignature || deletingSignature}
                                                    style={{ padding: "0 4px", height: 20, minWidth: 20 }}
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>
                                ) : (
                                    /* Empty state — full clickable dropzone matching sample-detail gallery */
                                    <div
                                        onClick={uploadingSignature ? undefined : triggerSignatureUpload}
                                        style={{
                                            width: 320,
                                            height: 160,
                                            borderRadius: tokens.radius,
                                            border: "1px dashed #d9d9d9",
                                            background: "#fafafa",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#8c8c8c",
                                            cursor: uploadingSignature ? "default" : "pointer",
                                            transition: "all 0.2s ease",
                                            padding: 12,
                                            flexShrink: 0,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (uploadingSignature) return;
                                            e.currentTarget.style.borderColor = tokens.primary;
                                            e.currentTarget.style.background = "#e6f7f7";
                                            e.currentTarget.style.color = tokens.primary;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = "#d9d9d9";
                                            e.currentTarget.style.background = "#fafafa";
                                            e.currentTarget.style.color = "#8c8c8c";
                                        }}
                                    >
                                        <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                                        <strong style={{ fontSize: 14 }}>
                                            {uploadingSignature ? "Subiendo..." : "Agregar firma"}
                                        </strong>
                                        <span style={{ marginTop: 4, fontSize: 12 }}>
                                            Clic para subir PNG
                                        </span>
                                    </div>
                                )}

                                <div style={{ fontSize: 12, color: tokens.textSecondary, lineHeight: 1.6, flex: 1, minWidth: 220, paddingTop: 4 }}>
                                    <div style={{ marginBottom: 4 }}>
                                        <strong style={{ color: tokens.textPrimary }}>Requisitos:</strong> archivo PNG de máximo 2 MB.
                                    </div>
                                    <div>Se recomienda usar una imagen con <strong style={{ color: tokens.textPrimary }}>fondo transparente</strong> para que la firma se integre correctamente al diseño del informe.</div>
                                </div>
                            </div>

                            <input
                                ref={signatureInputRef}
                                type="file"
                                accept="image/png"
                                onChange={handleSignatureFileSelected}
                                style={{ display: "none" }}
                            />
                        </Card>
                    )}
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <Layout style={{ minHeight: "100vh", padding: 0, margin: 0 }}>
            <SidebarCeluma selectedKey={(pathname as CelumaKey) ?? "/profile"} onNavigate={(k) => nav(k)} logoSrc={logo} />
            <Layout.Content style={{ padding: tokens.contentPadding, background: tokens.bg, fontFamily: tokens.textFont }}>
                <div style={{ maxWidth: tokens.maxWidth, margin: "0 auto" }}>
                    {content}
                </div>
            </Layout.Content>
        </Layout>
    );
};

export default Profile;
