FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN npx prisma generate

EXPOSE 4009

CMD ["npm", "start"]
