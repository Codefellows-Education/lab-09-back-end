DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS meetups;

CREATE TABLE IF NOT EXISTS locations(
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255),
    formatted_query VARCHAR(255),
    latitude NUMERIC(8,6),
    longitude NUMERIC(9,6)
);


CREATE TABLE IF NOT EXISTS weathers (
    id SERIAL PRIMARY KEY,
    forecast VARCHAR(255),
    time VARCHAR(255),
    created_at BIGINT,
    search_query VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    image_url VARCHAR(255),
    price VARCHAR(10),
    rating FLOAT,
    url VARCHAR(255),
    created_at BIGINT,
    search_query VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    overview TEXT,
    average_votes FLOAT,
    total_votes INT,
    image_url VARCHAR(255),
    popularity FLOAT,
    released_on VARCHAR(255),
    created_at BIGINT,
    search_query VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS meetups (
    id SERIAL PRIMARY KEY,
    link VARCHAR(255),
    name VARCHAR(255),
    creation_date VARCHAR(255),
    host VARCHAR(255),
    created_at BIGINT,
    search_query VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS trails (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    length FLOAT,
    stars FLOAT,
    star_votes INT,
    summary TEXT,
    trail_url VARCHAR(255),
    conditions VARCHAR(255),
    condition_date BIGINT,
    condition_time BIGINT,
    created_at BIGINT,
    search_query VARCHAR(255)
);