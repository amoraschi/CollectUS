import * as cheerio from 'cheerio'
import fetch from 'node-fetch'
import { writeFileSync, appendFileSync } from 'fs'

const url = 'https://alojawebapps.us.es/centrosdptos/pdi/'

;(async () => {
  writeFileSync('new.csv', 'id;surname;name;url\n')

  const results = await getData()
  console.log(`Got ${results.length} items`)

  const text = results.map(i => `${i.id};${i.surname};${i.name};${i.url}`).join('\n') + '\n'
  appendFileSync('new.csv', text)
  console.log(`${results.length} items written to new.csv`)
})()

async function getData () {
  const res = await fetch(url)

  const html = await res.text()

  const $ = cheerio.load(html)
  const items = $('#html > table > tbody > tr > td:nth-child(3) > ul > li').toArray()
  const results = items.map((item) => {
    const text = $(item).find('a').text().trim().split(', ')
    const url = $(item).find('a').attr('href')?.trim() ?? ''
    const id = url.split('=')[1]

    return {
      id,
      surname: text[0],
      name: text[1],
      url
    }
  })

  return results
}
