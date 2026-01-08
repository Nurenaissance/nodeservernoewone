

export const TRAVEL_TICKET_PROMPT = `
Given this flight/train/travel ticket. Identify the follwoing (if exists):
destinantion, 
source, 
arrival and departure time, 
duration of trip, 
name of the person traveling,
date of the journey,
type of journey (flight/train/by road)

return the answer in json format. if any of the field is missing, return null in its place

if you dont know the answer, return an empty json object. dont include any apologies or any other statements in your response
`

export const IDENTIFY_HEADERS_PROMPT = `
Given this headers list. Identify the header most similar to "phone" which might contain phone numbers. Return the index of the header.
Return only the index number, if no answer found or anything else, return "null". nothing else should you return
`
