# check=skip=SecretsUsedInArgOrEnv — a chave anon é pública (embutida no bundle do navegador)
# Dockerfile de produção do frontend React + Vite: build com Node e servidor estático com Nginx.
# O Railway usa este Dockerfile sempre que ele existe e informa a porta na variável PORT.
# Veja docs/RAILWAY.md.

# 1. Fase de build (Node 22 LTS; o engines do package.json exige 20.19+ ou 22.12+)
FROM node:22-alpine AS builder

WORKDIR /app

# Instalação reproduzível pelo lockfile
COPY package.json package-lock.json ./
RUN npm ci

# Variáveis de build: o Railway só as entrega ao Docker se estiverem declaradas como ARG.
# VITE_* é incorporado ao JavaScript: alterar qualquer valor exige novo build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . .

# Falha com mensagem clara se faltar configuração obrigatória (scripts/verificar-ambiente-producao.mjs)
RUN npm run build

# 2. Fase de execução (Nginx)
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html

# Template fora de /etc/nginx/templates: o entrypoint da imagem não deve processá-lo.
COPY nginx.conf /opt/nginx-template/default.conf.template

# Valor padrão para execução local; no Railway, PORT é injetada e prevalece.
ENV PORT=8080
EXPOSE 8080

# Gera a configuração com a porta de PORT (só dígitos, senão falha) e inicia o Nginx em primeiro plano.
CMD ["sh", "-c", "case \"$PORT\" in ''|*[!0-9]*) echo \"PORT inválida\" >&2; exit 1 ;; esac && sed \"s/__PORT__/$PORT/\" /opt/nginx-template/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
