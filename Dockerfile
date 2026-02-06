FROM nginx:stable-alpine

# Hapus bawaan Nginx
RUN rm -rf /usr/share/nginx/html/*

WORKDIR /usr/share/nginx/html

# Cachebuster → selalu rebuild
ARG CACHEBUST=1

# Copy file terbaru
# Pastikan siswa menaruh index.html di dalam folder "frontend/app/"
COPY ./app ./

EXPOSE 80