import * as cheerio from 'cheerio'
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import fetch from 'node-fetch'

const REFETCH = false
const ONLY_MODIFIED = true

;(async () => {
  const parseCsv = (path: string) =>
    readFileSync(path, 'utf-8')
      .split('\n')
      .slice(1)
      .filter(line => line.trim().length > 0)
      .map(line => {
        const [id, surname, name, url] = line.split(';')
        return { id, surname, name, url }
      })
      .filter(i => i.url != null && i.url.length > 0)

  const oldList = existsSync('data.csv') ? parseCsv('data.csv') : []
  const newList = parseCsv('new.csv')

  const oldIds = new Set(oldList.map(i => i.id))
  const newIds = new Set(newList.map(i => i.id))

  const additions = newList.filter(i => !oldIds.has(i.id))
  const deletions = oldList.filter(i => !newIds.has(i.id))

  let list = ONLY_MODIFIED ? additions : newList

  let i = 0

  if (!existsSync('detailed_data.csv')) {
    writeFileSync('detailed_data.csv', 'id;surname;name;url;correo;phones;category;faculties;department;area;subjects\n')
  }

  if (deletions.length > 0 && existsSync('detailed_data.csv')) {
    const lines = readFileSync('detailed_data.csv', 'utf-8').split('\n')
    const header = lines[0]
    const dataLines = lines.slice(1).filter(line => {
      const id = line.split(';')[0]
      return id && !deletions.some(d => d.id === id)
    })
    writeFileSync('detailed_data.csv', [header, ...dataLines].join('\n'))
    console.log(`Removed ${deletions.length} deleted entries from detailed_data.csv`)
  }

  if (!REFETCH) {
    const existingIds = new Set(
      readFileSync('detailed_data.csv', 'utf-8')
        .split('\n')
        .slice(1)
        .map(line => line.split(';')[0])
    )

    list = list.filter(item => !existingIds.has(item.id))
    console.log(`Resuming from index ${i}... (${list.length} remaining to fetch)`)
  }

  for (i; i < list.length; i++) {
    const item = list[i]
    if (item == null) continue

    try {
      console.log(`\n[${i + 1}/${list.length}] Fetching data for ${item.surname}, ${item.name}...`)

      // @ts-expect-error
      const data = await getData(item.url)
      const text = `${item.id};${item.surname};${item.name};${item.url};${data.email ?? ''};${data.phone ?? ''};${data.category ?? ''};${data.faculties ?? ''};${data.department ?? ''};${data.area ?? ''};${data.subjects ?? ''}`

      appendFileSync('temp_fetched.csv', text + '\n')

      console.log(`\nGot data for ${item.surname}, ${item.name}`)
    } catch (error) {
      console.error(`Error fetching data for ${item.surname}, ${item.name} at index ${i}:`, error)
      console.log(`Retrying index ${i}...`)
      i--
    }
  }

  const header = 'id;surname;name;url;email;phones;category;faculties;department;area;subjects\n'
  const detailedMap: Record<string, string> = {}

  if (existsSync('detailed_data.csv')) {
    readFileSync('detailed_data.csv', 'utf-8')
      .split('\n')
      .slice(1)
      .filter(line => line.trim().length > 0)
      .forEach(line => {
        const id = line.split(';')[0]
        // @ts-expect-error
        detailedMap[id] = line
      })
  }

  if (existsSync('temp_fetched.csv')) {
    readFileSync('temp_fetched.csv', 'utf-8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .forEach(line => {
        const id = line.split(';')[0]
        // @ts-expect-error
        detailedMap[id] = line
      })
  }

  // @ts-expect-error
  const newOrderedLines = newList.map(i => detailedMap[i.id]).filter(Boolean)
  writeFileSync('detailed_data.csv', header + newOrderedLines.join('\n') + '\n')
  if (existsSync('temp_fetched.csv')) rmSync('temp_fetched.csv')

  writeFileSync('data.csv', readFileSync('new.csv'))
  rmSync('new.csv')
})()

async function getData (url: string) {
  const res = await fetch(url)
  const html = await res.text()
  const $ = cheerio.load(html)

  return {
    email: $('h4:contains("Correo electrónico personal:")').next('p').text().trim(),
    phone: $('h4:contains("Teléfono:")').next('p').text().trim(),
    category: $('h3:contains("Categoría:")').next('p').text().trim(),
    faculties: $('h3:contains("Centro(s):")')
      .nextAll('ul')
      .first()
      .find('li a')
      .map((_, el) => $(el).text().trim())
      .get()
      .join('|'),
    department: $('h3:contains("Departamento:")').next('p').text().trim(),
    area: $('h3:contains("Area de Conocimiento:")').next('p').text().trim(),
    subjects: $('h3:contains("Asignaturas:")')
      .next('ul')
      .find('li a')
      .map((_, el) => $(el).text().trim())
      .get()
      .join('|')
  }
}
