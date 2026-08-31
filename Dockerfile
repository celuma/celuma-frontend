FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies based on lockfile
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and build
COPY . .

# Accept API base URL at build-time; Vite reads VITE_* vars during build
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Céluma version string (tag / SHA / pr-N-sha) injected by CI
ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# H-0c: source provenance, separate from the release version above. Empty by
# default; the release workflow stamps it with the commit SHA.
ARG VITE_APP_COMMIT=
ENV VITE_APP_COMMIT=${VITE_APP_COMMIT}

RUN npm run build

# Production image
FROM nginx:1.27-alpine

# Copy nginx template and entrypoint to render runtime config
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Render config from env and start nginx
ENV BACKEND_URL=http://backend:8000
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]


