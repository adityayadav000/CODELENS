terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0.1"
    }
  }
}

provider "docker" {}

# 1. Pull the Redis image
resource "docker_image" "redis_image" {
  name         = "redis:7-alpine"
  keep_locally = true
}

# 2. Run the Redis container via Terraform!
resource "docker_container" "redis_container" {
  name  = "codelens-tf-redis"
  image = docker_image.redis_image.image_id

  ports {
    internal = 6379
    external = 6380 # Using 6380 so it doesn't clash with your existing redis
  }
}

# 3. Print the status on screen
output "redis_container_name" {
  value = docker_container.redis_container.name
}

output "redis_port" {
  value = "Connected locally on port 6380"
}