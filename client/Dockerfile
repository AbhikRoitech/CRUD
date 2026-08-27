# ---- Stage 1: build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                      # clean, reproducible install
COPY . .
RUN npm run build               # outputs to /app/dist (Vite) or /app/build (CRA)

# ---- Stage 2: serve ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# For SPA routing, add a custom config that falls back to index.html:
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]