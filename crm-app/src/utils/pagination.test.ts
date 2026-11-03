import { getPageItems } from './pagination'

describe('getPageItems', () => {
  it('lists all pages when few', () => {
    expect(getPageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
  })
  it('collapses the end', () => {
    expect(getPageItems(1, 10)).toEqual([1, 2, 'ellipsis', 10])
  })
  it('collapses both sides', () => {
    expect(getPageItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
  })
  it('collapses the start', () => {
    expect(getPageItems(10, 10)).toEqual([1, 'ellipsis', 9, 10])
  })
})
