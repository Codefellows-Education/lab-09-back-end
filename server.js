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




app.get('/location', getHandlerFunction('locations'));
app.get('/weather', getHandlerFunction('weathers'));
app.get('/yelp', getHandlerFunction('restaurants'));
app.get('/movies', getMovies);
app.get('/meetups', getMeetups);
app.get('/trails', getTrails);

function getHandlerFunction(name){
  return function (request, response) {
    const handler = {
      // in the case of /location, request.query.data is the search_query
      // in the case of others, request.query.data is the location object
      query: request.query.data,
  
      cacheHit: (results) => {
        // locations wants just the firt record
        // others need all results
        response.send(name ==='locations' ? results.rows[0] : results.rows);
      },
  
      cacheMiss: () => {
        fetchApiData(name, request.query.data)
          .then(data => response.send(data));
      }
    }
  
    lookupInfoInDatabase(name, handler);
  }
}

const cacheForMinutes = {
  locations: 0,
  meetups: 60*60*24,
  trails: 60,
  restaurants: 60*60*24,
  weathers: 60
}
function lookupInfoInDatabase(name, handler) {
  const SQL = `SELECT * FROM ${name} WHERE search_query=$1;`
  const values = [handler.query];

  return client.query(SQL, values)

    .then(result => {
      if (result.rowCount > 0) {
        console.log(`${name} data existed in DATABASE`);

        if (name !== 'locations'){
          let minutesOld = (new Date().getTime() - result.rows[0].created_at) / (1000*60);

          if (
            result.rowCount > 0 &&
            (!cacheForMinutes[name] || minutesOld > cacheForMinutes[name])
          ) {
            console.log(`${name} Data was too old`);
            deleteEntryByQuery(name, handler.search_query)
            handler.cacheMiss();
          } else {
            handler.cacheHit(result);
          }
        } else {
          handler.cacheHit(result);
        }
      } else {
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(`look up ${name}`, error));
}

function fetchApiData(name, query) {
  // const URL = apiConfig[name](query)
  let URL;
  let Constructor;
  let resultsKey;
  let resultsSubKey;
  let resultsGetAll = true;
  switch(name) {
  case 'locations':
    URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
    Constructor = Location;
    resultsKey = 'results';
    resultsGetAll = false;
    break;
  case 'weathers':
    URL = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${query.latitude},${query.longitude}`;
    Constructor = Weather;
    resultsKey = 'daily';
    resultsSubKey = 'data';
    break;
  case 'restaurants':
    URL = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}&categories=restaurants`;
    Constructor = Restaurants;
    resultsKey = 'businesses';
    break;
  case 'restaurants':
    URL = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}&categories=restaurants`;
    Constructor = Restaurants;
    resultsKey = 'businesses';
    break;
  default:
    console.error('name does not have a URL defined', name);
  }

  return superagent.get(URL)
    .set( 'Authorization', name==='restaurants' ? `Bearer ${process.env.YELP_API_KEY}` : '')
    .then(data => {
      console.log(`got ${name} data from API:`);
      if (!data.body) throw `No Data from ${name} API`;
      else {
        // locations: data.body.results (first array item)
        // weather: data.body.daily.data (all array items)
        // restaurants: data.body.businesses (all array items)
        // movies: data.body.results (all array items)
        // meetups: data.body (all array items)
        // trails: data.body.trails (all array items)
        let results = data.body;
        if(resultsKey){
          results = results[resultsKey];
        }
        if(resultsSubKey){ // handle case of weather
          results = results[resultsSubKey];
        }
        if(!resultsGetAll){// this is for the location
          let formattedDataObject = new Constructor(query,results[0]);
          formattedDataObject.save();
          return formattedDataObject;
        } else {
          let apiData = results.map( value => {
            let formattedDataObject = new Constructor(query, value);
            formattedDataObject.save();
            return formattedDataObject;
          })
          return apiData;
        }
      }
    })
    .catch(console.error);
}

function deleteEntryByQuery(name, search_query) {
  const SQL = `DELETE FROM ${name} WHERE search_query=$1;`;
  const value = [search_query];
  client.query(SQL, value)
    .then(() => {
      console.log(`DELETED ${name} entry from database`);
    })
    .catch(error => handleError(name ,error));
}

////////////////LOCATION////////////////

function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
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

function Weather (query, data) {
  this.forecast = data.summary;
  this.time = new Date(data.time * 1000).toString().slice(0,15);
  this.created_at = new Date().getTime();
  this.search_query = query;
}

Weather.prototype.save = function () {
  let SQL = `INSERT INTO weathers(forecast, time, created_at, search_query) VALUES($1, $2, $3, $4)`;
  let values = Object.values(this);

  client.query(SQL,values)
    .then(()=>console.log('weather saved'))
    .catch(err => console.error('weather save error',err))
}

////YELP

function Restaurants(query, data) {
  this.name = data.name;
  this.image_url = data.image_url;
  this.price = data.price;
  this.rating = data.rating;
  this.url = data.url;
  this.created_at = new Date().getTime();
  this.search_query = query;
}

Restaurants.prototype.save = function () {
  let SQL = `INSERT INTO restaurants(name, image_url, price, rating, url, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7)`;
  let values = Object.values(this);

  client.query(SQL,values)
    .then(data=>console.log('restaurant', data.command))
    .catch(err => console.error('restaurant save error',err));
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

function Movies(query, data) {
  this.title = data.title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w500/'+data.poster_path;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
  this.created_at = new Date().getTime();
  this.search_query = query;
}

Movies.prototype.save = function () {
  let SQL = `INSERT INTO movies(title, overview, average_votes, total_votes, image_url, popularity, released_on, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
  let values = Object.values(this);

  client.query(SQL,values)
    .then(data=>console.log('movie saved', data))
    .catch(err => console.error('movie save error',err));
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
    .catch(console.error);
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

function Meetups(query, data) {
  this.link = data.link;
  this.name = data.name;
  this.creation_date = new Date(data.created);
  this.host = data.organizer.name;
  this.created_at = new Date().getTime();
  this.search_query = query;
}

Meetups.prototype.save = function () {
  let SQL = `INSERT INTO meetups(link, name, creation_date, host, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6)`;
  let values = Object.values(this);

  client.query(SQL,values)
    .then(data=>console.log('meetup saved', data))
    .catch(err => console.error('meetup save error',err));
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
    .catch(console.error);
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

function Trails(query, data) {
  this.name = data.name;
  this.location = data.location;
  this.length = data.length;
  this.stars = data.stars;
  this.star_votes = data.starVotes;
  this.summary = data.summary;
  this.trail_url = data.url;
  this.conditions = data.conditionDetails;
  this.condition_date = data.conditionDate.slice(0, 10);
  this.condition_time = data.conditionDate.slice(11,19);
  this.created_at = new Date().getTime();
  this.search_query = query;
}

Trails.prototype.save = function () {
  let SQL = `INSERT INTO trails(name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time, created_at, search_query) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
  let values = Object.values(this);
  console.log(values)
  client.query(SQL,values)
    .then(data=>console.log('trail saved', data))
    .catch(err => console.error('trail save error',err));
}

Trails.fetchTrails = (locationObject) => {
  const URL = `https://www.hikingproject.com/data/get-trails?lat=${locationObject.latitude}&lon=${locationObject.longitude}&key=${process.env.TRAILS_API_KEY}`
  console.log('the URL is ' + URL);
  return superagent.get(URL)
    .then( data => {
      if (!data.body) throw 'No Data';
      else {
        let trailData = data.body.trails.map( item => {
          let trails = new Trails (item, locationObject.search_query);
          trails.save();
          return trails;
        })
        return trailData;
      }
    })
    .catch(console.error);
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
function handleError(name, error, response) {
  console.log(name, 'error',error);
  if(response){
    response.status(500).send('sorry there is no data')
  }
}

