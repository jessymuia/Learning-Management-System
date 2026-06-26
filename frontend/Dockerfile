FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# build-time API base. The /api rewrite runs server-side inside this container,
# so it must reach the backend by its compose service name, not localhost.
# (Browser code uses relative /api, so it never sees this value directly.)
ENV NEXT_PUBLIC_API_BASE=http://api:8000
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
