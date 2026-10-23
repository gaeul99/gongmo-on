# ==========================================================
# 공모온 단일 서비스 이미지 — 프론트(Vite SPA)를 빌드해 백엔드(FastAPI)가
# 함께 서빙한다. Render 같은 PaaS에서 서비스 하나로 API+화면을 운영하기
# 위함이며, 같은 오리진이라 CORS·API 주소 설정이 필요 없다.
# ==========================================================
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# 빈 문자열로 고정해 빌드 산출물이 같은 오리진의 /api를 바라보게 한다.
ENV VITE_API_BASE_URL=""
RUN npm run build

FROM python:3.14-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /app/frontend/dist /app/static
ENV STATIC_DIR=/app/static \
    OPENAI_MODEL=openai/gpt-6-luna
EXPOSE 3000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
