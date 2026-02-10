# ✅ Use small, fast Node image
FROM node:20-alpine

# ✅ Set working directory
WORKDIR /app

# ✅ Copy package files first (better caching)
COPY package*.json ./

# ✅ Install only production dependencies (modern safe flag)
RUN npm install --omit=dev

# ✅ Copy app source
COPY . .

# ✅ Expose your app port (local use)
EXPOSE 4009

# ✅ Start the app
CMD ["npm", "start"]
