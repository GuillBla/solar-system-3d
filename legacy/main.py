import pygame
import math
import time


# Initialize Pygame
pygame.init()

# Set up the display
width, height = 1000, 800
screen = pygame.display.set_mode((width, height))
pygame.display.set_caption("Planetary Motion Simulation")

BLACK = (0, 0, 0)

# Define real values for the Solar System
sun_radius = 695510  # km
sun_mass = 1.989 * 10 ** 30  # kg
sun_img = pygame.image.load("images/sun.jpg")

mercury_radius = 2440  # km
mercury_mass = 3.3011 * 10 ** 23  # kg
mercury_distance = 57.9 * 10 ** 6  # km
mercury_speed = 47.87  # km/s
mercury_img = pygame.image.load("images/mercury.jpg")

venus_radius = 6052  # km
venus_mass = 4.8675 * 10 ** 24  # kg
venus_distance = 108.2 * 10 ** 6  # km
venus_speed = 35.02  # km/s
venus_img = pygame.image.load("images/venus.jpg")

earth_radius = 6371  # km
earth_mass = 5.972 * 10 ** 24  # kg
earth_distance = 149.6 * 10 ** 6  # km
earth_speed = 29.78  # km/s
earth_img = pygame.image.load("images/earth.jpg")

mars_radius = 3390  # km
mars_mass = 6.4171 * 10 ** 23  # kg
mars_distance = 227.9 * 10 ** 6  # km
mars_speed = 24.13  # km/s
mars_img = pygame.image.load("images/mars.jpg")

jupiter_radius = 69911  # km
jupiter_mass = 1.8982 * 10 ** 27  # kg
jupiter_distance = 778.5 * 10 ** 6  # km
jupiter_speed = 13.07  # km/s

saturn_radius = 58232  # km
saturn_mass = 5.6834 * 10 ** 26  # kg
saturn_distance = 1429 * 10 ** 6  # km
saturn_speed = 9.69  # km/s

uranus_radius = 25362  # km
uranus_mass = 8.6810 * 10 ** 25  # kg
uranus_distance = 2871 * 10 ** 6  # km
uranus_speed = 6.81  # km/s

neptune_radius = 24622  # km
neptune_mass = 1.02413 * 10 ** 26  # kg
neptune_distance = 4495 * 10 ** 6  # km
neptune_speed = 5.43  # km/s

# Scaling factors
radius_scale_factor = 0.0005    # Adjust this value as needed
distance_scale_factor =  0.0000015    # Adjust this value as needed
time_speed_factor = 0.000008  # Lower value for slower motion, higher value for faster motion
damping_factor = 0.99  # Adjust this value to control damping


# Planet class
class Planet:
    def __init__(self, name, image, radius, mass, distance, speed):
        self.name = name
        self.radius = radius * radius_scale_factor
        self.mass = mass
        self.distance = distance * distance_scale_factor
        self.angle = 0
        self.speed = speed
        self.image = image
    
    def update(self, planets):
        ax = 0
        ay = 0
        G = 6.67430 * 10 ** (-11)  # Gravitational constant (m^3 kg^(-1) s^(-2))

        for planet in planets:
            if planet is not self:
                dx = planet.distance * math.cos(math.radians(planet.angle)) - self.distance * math.cos(math.radians(self.angle))
                dy = planet.distance * math.sin(math.radians(planet.angle)) - self.distance * math.sin(math.radians(self.angle))
                dist_squared = dx ** 2 + dy ** 2
                dist = math.sqrt(dist_squared) * 10 ** 9  # Convert distance to meters

                # Calculate gravitational force
                force = (G * self.mass * planet.mass) / dist_squared

                # Decompose the force into x and y components
                fx = (force * dx) / dist
                fy = (force * dy) / dist

                # Update acceleration
                ax += fx / self.mass
                ay += fy / self.mass

        # Update velocity
        self.speed = (self.speed + math.sqrt(ax ** 2 + ay ** 2) * 10 ** (-3)) * damping_factor * time_speed_factor
        self.angle += self.speed

    def draw(self):
        scaled_radius = self.radius * 0.1 if self.name == "Sun" else self.radius * 7
        x = width // 2 + self.distance * math.cos(math.radians(self.angle))
        y = height // 2 + self.distance * math.sin(math.radians(self.angle))
        scaled_image = pygame.transform.scale(self.image, (int(scaled_radius * 2), int(scaled_radius * 2)))
        image_rect = scaled_image.get_rect(center=(x, y))
        screen.blit(scaled_image, image_rect)

# Create the planets
sun = Planet("Sun", sun_img, sun_radius, sun_mass, 0, 0)
mercury = Planet("Mercury", mercury_img, mercury_radius, mercury_mass, mercury_distance, mercury_speed*time_speed_factor)
venus = Planet("Venus", venus_img, venus_radius, venus_mass, venus_distance, venus_speed*time_speed_factor)
earth = Planet("Earth", earth_img, earth_radius, earth_mass, earth_distance, earth_speed*time_speed_factor)
mars = Planet("Mars", mars_img, mars_radius, mars_mass, mars_distance, mars_speed*time_speed_factor)
# jupiter = Planet("Jupiter", RED, jupiter_radius, jupiter_mass, jupiter_distance, jupiter_speed)
# saturn = Planet("Saturn", RED, saturn_radius, saturn_mass, saturn_distance, saturn_speed)
# uranus = Planet("Uranus", RED, uranus_radius, uranus_mass, uranus_distance, uranus_speed)
# neptune = Planet("Neptune", RED, neptune_radius, neptune_mass, neptune_distance, neptune_speed)

planets = [sun, mercury, venus, earth, mars]

# Game loop
running = True
while running:
    # Event handling
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    
    # Update the planets
    for planet in planets:
        planet.update(planets)
    
    # Render the scene
    screen.fill(BLACK)
    for planet in planets:
        planet.draw()
    pygame.display.flip()

    # Delay between frames to control the frame rate

# Quit the game
pygame.quit()
