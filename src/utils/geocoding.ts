export interface AddressInfo {
  display_name: string
  address: {
    province?: string
    city?: string
    town?: string
    village?: string
    suburb?: string
    city_district?: string
    neighbourhood?: string
    road?: string
    house_number?: string
    [key: string]: string | undefined
  }
}

export const reverseGeocode = async (lat: number, lon: number): Promise<AddressInfo | null> => {
  try {
    // OpenStreetMap Nominatim API
    // User-Agent is required by their Usage Policy
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ToshiyukiNote/1.0 (shimadatoshiyuki839@gmail.com)', // Identifying the application
        'Accept-Language': 'ja' // Request Japanese results
      }
    })

    if (!response.ok) {
      console.error('Geocoding failed:', response.statusText)
      return null
    }

    const data = await response.json()
    return data as AddressInfo
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

export const formatAddress = (info: AddressInfo): string => {
  const { address } = info
  
  // Construct address: Prefecture + City/Town/Village + District/Suburb
  const region = address.province || ''
  const city = address.city || address.town || address.village || ''
  const local = address.suburb || address.city_district || address.neighbourhood || ''
  
  // Basic filtering to avoid too much duplication if API returns redundant data, though Nominatim is usually okay.
  let result = `${region}${city}${local}`
  
  // If local part is empty, maybe append road if available to give some context, but user asked for "字" (aza) level.
  // suburb/city_district usually maps to "字" or "Chome".
  
  if (!result) {
      return info.display_name // Fallback to full string if parsing fails
  }
  
  return result
}
