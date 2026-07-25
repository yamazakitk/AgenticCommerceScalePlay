FROM nginx:alpine

# Copy nginx template configuration for dynamic port binding
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Copy website static assets
COPY . /usr/share/nginx/html/

# Port environment variable (defaults to 8080 for Cloud Run)
ENV PORT=8080

EXPOSE 8080
