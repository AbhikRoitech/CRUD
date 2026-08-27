FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# RUN npm run build               # tsc → compiles src/ to dist/
EXPOSE 5000
CMD ["node", "index.js"]