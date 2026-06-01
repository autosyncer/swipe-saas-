FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4002
ENV PORT=4002
ENV HOSTNAME="0.0.0.0"
CMD ["node", "dist/index.js"]
