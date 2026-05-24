import type { Book, Chapter } from '../types'

export class BookManager {
  private get api() {
    const api = window.electronAPI
    if (!api) throw new Error('Electron API not available')
    return api
  }

  async createBook(
    title: string,
    author: string,
    genre: string,
    description: string,
    workspacePath: string
  ): Promise<Book> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const projectPath = `${workspacePath}\\${slug}`

    await this.api.createDirectory(projectPath)

    const book: Book = {
      id: `book-${Date.now()}`,
      title,
      author,
      genre,
      description,
      chapters: [],
      projectPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await this.saveBook(book)
    await this.writeChaptersIndex(book)
    return book
  }

  async saveBook(book: Book): Promise<void> {
    book.updatedAt = Date.now()
    await this.api.writeFile(
      `${book.projectPath}\\book.json`,
      JSON.stringify(book, null, 2)
    )
  }

  async loadBook(projectPath: string): Promise<Book> {
    const raw = await this.api.readFile(`${projectPath}\\book.json`)
    return JSON.parse(raw) as Book
  }

  async addChapter(book: Book, title: string): Promise<Chapter> {
    const number = book.chapters.length + 1
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `chapter-${number}`
    const filePath = `${book.projectPath}\\chapter-${String(number).padStart(2, '0')}-${slug}.md`

    const chapter: Chapter = {
      id: `ch-${Date.now()}`,
      number,
      title,
      filePath,
      status: 'outline',
    }

    // Create empty chapter file with header
    await this.api.writeFile(filePath, `# Chapter ${number}: ${title}\n\n`)

    book.chapters.push(chapter)
    await this.saveBook(book)
    await this.writeChaptersIndex(book)
    return chapter
  }

  async updateChapterContent(book: Book, chapterId: string, content: string): Promise<void> {
    const ch = book.chapters.find(c => c.id === chapterId)
    if (!ch?.filePath) return
    await this.api.writeFile(ch.filePath, content)
    ch.status = 'draft'
    await this.saveBook(book)
    await this.writeChaptersIndex(book)
  }

  async readChapterContent(chapter: Chapter): Promise<string> {
    if (!chapter.filePath) return ''
    try {
      return await this.api.readFile(chapter.filePath)
    } catch {
      return ''
    }
  }

  async readAllChapters(book: Book): Promise<{ chapter: Chapter; content: string }[]> {
    const results: { chapter: Chapter; content: string }[] = []
    for (const ch of book.chapters) {
      const content = await this.readChapterContent(ch)
      results.push({ chapter: ch, content })
    }
    return results
  }

  buildBookPrompt(book: Book, chapters: { chapter: Chapter; content: string }[]): string {
    const toc = chapters
      .map(({ chapter }) => `  Chapter ${chapter.number}: ${chapter.title}`)
      .join('\n')

    const chapterBlocks = chapters
      .map(({ chapter, content }) => {
        const body = content.trim() || '[No content yet]'
        return `---\n## Chapter ${chapter.number}: ${chapter.title}\n\n${body}`
      })
      .join('\n\n')

    return `You are a professional book editor and author. Using the chapter drafts below, write the complete, polished, cohesive version of the book titled "${book.title}" by ${book.author || 'Unknown'}.

BOOK DETAILS:
- Title: ${book.title}
- Author: ${book.author || 'TBD'}
- Genre: ${book.genre || 'Science Fiction'}
- Description: ${book.description || ''}

TABLE OF CONTENTS:
${toc}

CHAPTER DRAFTS:
${chapterBlocks}

BOOK EDITOR INSTRUCTIONS:
1. Write each chapter fully, using the draft as the foundation — expand, refine, and ensure narrative consistency.
2. Ensure character voices, names, and world-building details are consistent across all chapters.
3. Add chapter transitions that flow naturally — the ending of each chapter should create momentum into the next.
4. Apply the genre conventions of ${book.genre || 'Science Fiction'} with skill and intentionality.
5. The tone established in the drafts must be preserved and deepened — do not neutralize the author's voice.
6. Output the complete book in Markdown format: title, author, then each chapter as a level-2 heading.
7. Do not add preamble or commentary — output the book text only.

Begin writing the complete book now:`
  }

  private async writeChaptersIndex(book: Book): Promise<void> {
    const lines = [
      `# ${book.title} — Chapter Index`,
      ``,
      `**Author:** ${book.author || 'TBD'}`,
      `**Genre:** ${book.genre || 'TBD'}`,
      book.description ? `**Description:** ${book.description}` : '',
      ``,
      `## Chapters`,
      ``,
      ...book.chapters.map(ch => {
        const status = ch.status === 'complete' ? '✅' : ch.status === 'draft' ? '📝' : '○'
        return `${status} Chapter ${ch.number}: ${ch.title}${ch.filePath ? ` — \`${ch.filePath.split('\\').pop()}\`` : ''}`
      }),
    ].filter(l => l !== undefined)

    await this.api.writeFile(`${book.projectPath}\\chapters.md`, lines.join('\n'))
  }
}
