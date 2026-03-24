/**
 * Third-party open-source dependencies used in production.
 * Keep this list in sync with package.json `dependencies` and
 * celuma-backend/requirements.txt (excluding test tools) when they change.
 */

export const FRONTEND_DEPENDENCIES = `\
@hookform/resolvers
antd
dayjs
dompurify
html2canvas
html2pdf.js
jspdf
quill
react
react-colorful
react-dom
react-hook-form
react-quill-new
react-router-dom
tailwindcss
zod`;

export const BACKEND_DEPENDENCIES = `\
fastapi
uvicorn
sqlmodel
sqlalchemy
alembic
pydantic-settings
psycopg2-binary
python-jose
passlib
python-multipart
email-validator
boto3
Pillow
rawpy
imageio`;
