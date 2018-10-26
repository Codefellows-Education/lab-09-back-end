'use strict';

const express = require('express');
const cors = require('cors');
const superagent =require('superagent');
require('dotenv').config();
const pg = require('pg');
console.log(process.env.DATABASE_URL);



const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

const PORT = process.env.PORT || 3000;

const app = express();
app.listen(PORT, () => console.log(`App is up on http://localhost:${PORT}`));

app.use(cors());




app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/yelp', getRestaurants);
app.get('/movies', getMovies);
app.get('/meetups', getMeetups);
app.get('/trails', getTrails);

function getLocation(request, response) {
  const locationHandler = {
    query: request.query.data,

    cacheHit: (results) => {
      response.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.fetchLocation(request.query.data)
        .then(data => response.send(data));
    }
  }

  Location.lookUpLocation(locationHandler);
}

function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}

Location.lookUpLocation = (handler) => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`
  const values = [handler.query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        handler.cacheHit(results);
      } else {
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}

Location.fetchLocation = (query) => {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(URL)
    .then(data => {
      console.log('got location data from google maps API:');
      if (!data.body.results.length) throw 'No Data';
      else {
        let location = new Location(query, data.body.results[0]);
        location.save();

        return location;
      }
    });
}
Location.prototype.save = function () {
  let SQL = `INSERT INTO locations(search_query, formatted_query, latitude, longitude) VALUES($1, $2, $3, $4)`;
  let values = Object.values(this);
  client.query(SQL,values)
    .then(() => {
      // console.log('insert',result)
    })
    .catch(e => console.error(e.stack));
}






/////weather////////////////


/**
 * getWeather is an API handler for fetching weather related to a location search string
 * request.query.data is a full location object (minus the location_id)
 * 
 * @param {object} request 
 * @param {object} response 
 */
function getWeather(request, response) {
  const handler = {
    search_query: request.query.data.search_query,

    cacheHit: (result) => {
      response.send(result.rows);
    },

    cacheMiss: () => {
      Weather.fetchWeather(request.query.data)
        .then(data => response.send(data));
    }
  }

  Weather.lookUpWeather(handler);
}

function Weather (day, search_query) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0,15);
  this.created_at = new Date().getTime();
  this.search_query = search_query;
}

Weather.prototype.save = function () {
  let SQL = `INSERT INTO weathers(forecast, time, created_at, search_query) VALUES($1, $2, $3, $4)`;
  let values = Object.values(this);

  client.query(SQL,values);
}

Weather.fetchWeather = (locationObject) => {
  const URL = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${locationObject.latitude},${locationObject.longitude}`;

  return superagent.get(URL)
    .then(data => {
      if (!data.body.daily.data.length) throw 'No Data';
      else {
        let weatherData = data.body.daily.data.map( day => {
          let weather = new Weather(day, locationObject.search_query);
          weather.save();
          return weather;
        })
        return weatherData;
      }
    });
}



Weather.lookUpWeather = (handler) => {
  const SQL = `SELECT * FROM weathers WHERE search_query=$1;`
  const values = [handler.search_query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        console.log('got weather data from database');
        handler.cacheHit(results);
      } else {
        console.log('got weather data from API');
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}

////YELP

function getRestaurants(request, response) {
  const handler = {
    search_query: request.query.data.search_query,

    cacheHit: (result) => {
      response.send(result.rows);
    },

    cacheMiss: () => {
      Restaurants.fetchRestaurants(request.query.data)
        .then(data => response.send(data));
    }
  }

  Restaurants.lookUpRestaurants(handler);
}

function Restaurants(restaurants, search_query) {
  this.name = restaurants.name;
  this.image_url = restaurants.image_url;
  this.price = restaurants.price;
  this.rating = restaurants.rating;
  this.url = restaurants.url;
  this.created_at = new Date().getTime();
  this.search_query = search_query;
}

Restaurants.prototype.save = function () {
  let SQL = `INSERT INTO restaurants(name, image_url, price, rating, url, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7)`;
  let values = Object.values(this);

  client.query(SQL,values);
}

Restaurants.fetchRestaurants = (locationObject) => {
  
  const URL = `https://api.yelp.com/v3/businesses/search?latitude=${locationObject.latitude}&longitude=${locationObject.longitude}&categories=restaurants`;

  return superagent.get(URL)
    .set( 'Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then( data => {
      if (!data.body.businesses.length) throw 'No Data';
      else {
        let restaurantsData = data.body.businesses.map( item => {
          let restaurants = new Restaurants(item, locationObject.search_query);
          restaurants.save();
          return restaurants;
        })
        return restaurantsData;
      }
    })
    .catch(error => handleError(error));
}

Restaurants.lookUpRestaurants = (handler) => {
  const SQL = `SELECT * FROM restaurants WHERE search_query=$1;`
  const values = [handler.search_query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        console.log('got restaurants data from database');
        handler.cacheHit(results);
      } else {
        console.log('got restaurants data from API');
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}
// //////////MOVIES///////////////

function getMovies(request, response) {
  const handler = {
    search_query: request.query.data.search_query,

    cacheHit: (result) => {
      response.send(result.rows);
    },

    cacheMiss: () => {
      Movies.fetchMovies(request.query.data)
        .then(data => response.send(data))
        .catch(console.error);
    }
  }

  Movies.lookUpMovies(handler);
}

function Movies(movie, search_query) {
  this.title = movie.title;
  this.overview = movie.overview;
  this.average_votes = movie.vote_average;
  this.total_votes = movie.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w500/'+movie.poster_path;
  this.popularity = movie.popularity;
  this.released_on = movie.release_date;
  this.created_at = new Date().getTime();
  this.search_query = search_query;
}

Movies.prototype.save = function () {
  let SQL = `INSERT INTO movies(title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
  let values = Object.values(this);

  client.query(SQL,values);
}

Movies.fetchMovies = (locationObject) => {
  const URL = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API_KEY}&query=${locationObject.search_query}`;
  console.log('the URL is ' + URL);
  return superagent.get(URL)
    .then( data => {
      // console.log(data.body);
      if (!data.body) throw 'No Data';
      else {
        let movieData = data.body.results.map( item => {
          let movies = new Movies(item, locationObject.search_query);
          movies.save();
          return movies;
        })
        return movieData;
      }
    })
}

Movies.lookUpMovies = (handler) => {
  const SQL = `SELECT * FROM movies WHERE search_query=$1;`
  const values = [handler.search_query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        console.log('got Movies data from database');
        handler.cacheHit(results);
      } else {
        console.log('got Movies data from API');
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}


////////////////Meet Up///////////////////


function getMeetups(request, response) {
  const handler = {
    search_query: request.query.data.search_query,

    cacheHit: (result) => {
      response.send(result.rows);
    },

    cacheMiss: () => {
      Meetups.fetchMeetups(request.query.data)
        .then(data => response.send(data))
        .catch(console.error);
    }
  }

  Meetups.lookUpMeetups(handler);
}

function Meetups(meetup, search_query) {
  this.link = meetup.link;
  this.name = meetup.name;
  this.creation_date = new Date(meetup.created);
  this.host = meetup.organizer.name;
  this.created_at = new Date().getTime();
  this.search_query = search_query;
}

Meetups.prototype.save = function () {
  let SQL = `INSERT INTO meetups(link, name, creation_date, host, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6)`;
  let values = Object.values(this);

  client.query(SQL,values);
}

Meetups.fetchMeetups = (locationObject) => {
  const URL = `https://api.meetup.com/find/groups?key=${process.env.MEETUPS_API_KEY}&query=${locationObject.search_query}&radius=1`
  console.log('the URL is ' + URL);
  return superagent.get(URL)
    .then( data => {
      if (!data.body) throw 'No Data';
      else {
        let movieMeetups = data.body.map( item => {
          let meetup = new Meetups(item, locationObject.search_query);
          meetup.save();
          return meetup;
        })
        return movieMeetups;
      }
    })
}

Meetups.lookUpMeetups = (handler) => {
  const SQL = `SELECT * FROM meetups WHERE search_query=$1;`
  const values = [handler.search_query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        console.log('got Meetups data from database');
        handler.cacheHit(results);
      } else {
        console.log('got Meetups data from API');
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}

////////////TRAILS///////////////


function getTrails(request, response) {
  const handler = {
    search_query: request.query.data.search_query,

    cacheHit: (result) => {
      response.send(result.rows);
    },

    cacheMiss: () => {
      Trails.fetchTrails(request.query.data)
        .then(data => response.send(data))
        .catch(console.error);
    }
  }

  Trails.lookUpTrails(handler);
}

function Trails(trail, search_query) {
  this.name = trail.name;
  this.location = trail.location;
  this.length = trail.length;
  this.stars = trail.stars;
  this.star_votes = trail.star_votes;
  this.summary = trail.summary;
  this.trail_url = trail.url;
  this.conditions = trail.conditions;
  this.condition_date = trail.condition_date;
  this.condition_time = trail.condition_time;
  this.created_at = new Date().getTime();
  this.search_query = search_query;
}

Trails.prototype.save = function () {
  let SQL = `INSERT INTO trails(name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
  let values = Object.values(this);

  client.query(SQL,values);
}

Trails.fetchTrails = (locationObject) => {
  const URL = `https://www.hikingproject.com/data/get-trails?lat=${locationObject.latitude}&lon=${locationObject.longitude}&key=${process.env.TRAILS_API_KEY}`
  console.log('the URL is ' + URL);
  return superagent.get(URL)
    .then( data => {
      if (!data.body) throw 'No Data';
      else {
        let trailData = data.body.map( item => {
          let trails = new Meetups(item, locationObject.search_query);
          trails.save();
          return trails;
        })
        return trailData;
      }
    })
}

Trails.lookUpTrails = (handler) => {
  const SQL = `SELECT * FROM trails WHERE search_query=$1;`
  const values = [handler.search_query];

  return client.query(SQL, values)
    .then((results) => {
      if (results.rowCount > 0) {
        console.log('got Trails data from database');
        handler.cacheHit(results);
      } else {
        console.log('got Trails data from API');
        handler.cacheMiss();
      }
    })
    .catch(console.error);
}


// [
//   {
//     "name": "Rattlesnake Ledge",
//     "location": "Riverbend, Washington",
//     "length": "4.3",
//     "stars": "4.4",
//     "star_votes": "84",
//     "summary": "An extremely popular out-and-back hike to the viewpoint on Rattlesnake Ledge.",
//     "trail_url": "https://www.hikingproject.com/trail/7021679/rattlesnake-ledge",
//     "conditions": "Dry: The trail is clearly marked and well maintained.",
//     "condition_date": "2018-07-21",
//     "condition_time": "0:00:00 "
//   },
//   {
//     "name": "Mt. Si",
//     "location": "Tanner, Washington",
//     "length": "6.6",
//     "stars": "4.4",
//     "star_votes": "72",
//     "summary": "A steep, well-maintained trail takes you atop Mt. Si with outrageous views of Puget Sound.",
//     "trail_url": "https://www.hikingproject.com/trail/7001016/mt-si",
//     "conditions": "Dry",
//     "condition_date": "2018-07-22",
//     "condition_time": "0:17:22 "
//   },
//   ...
// ]

//////////errors
function handleError(error,response) {
  console.log('error',error);
  if(response){
    response.status(500).send('sorry there is no data')
  }
}

