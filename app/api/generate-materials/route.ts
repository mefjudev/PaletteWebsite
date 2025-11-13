import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BIMItem } from '@/lib/types/bim';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 API called - starting material generation');
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API key not found');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    
    console.log('✅ OpenAI API key found');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    
    console.log('📁 Image file received:', imageFile ? `${imageFile.name} (${imageFile.size} bytes)` : 'No file');
    
    if (!imageFile) {
      console.log('❌ No image file provided');
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    console.log('🔄 Converting image to base64...');
    const imageBuffer = await imageFile.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const mimeType = imageFile.type;
    
    console.log('✅ Image converted, size:', base64Image.length, 'characters');

    console.log('🤖 Calling OpenAI API...');
    
    const useDemoMode = process.env.DEMO_MODE === 'true';
    
    if (useDemoMode) {
      console.log('🎭 Using demo mode - generating sample materials');
      const materials = [
        {
          code: "TI-01",
          area: "Kitchen",
          location: "Floor",
          finish: "Grade A Oak Flooring",
          supplierAndContact: "Travis Perkins (sales@travisperkins.co.uk, 0345 0268 268)",
          pricePerSqm: { low: 45, mid: 65, high: 85 },
          type: "Timber"
        },
        {
          code: "MT-01",
          area: "Living Room",
          location: "Countertop",
          finish: "Polished Marble Countertop",
          supplierAndContact: "Jewson (info@jewson.co.uk, 0800 539 766)",
          pricePerSqm: { low: 70, mid: 100, high: 150 },
          type: "Metal"
        },
        {
          code: "GL-01",
          area: "Kitchen",
          location: "Window",
          finish: "Tempered Glass Panel",
          supplierAndContact: "Pilkington (info@pilkington.com, 01744 692000)",
          pricePerSqm: { low: 20, mid: 30, high: 40 },
          type: "Glass"
        }
      ];
      
      console.log('✅ Demo materials generated');
      return NextResponse.json({ materials });
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image and generate a BIM material schedule. For each material you identify, provide:
              - Code (format: TI-XX for Timber, MT-XX for Metal, GL-XX for Glass, PL-XX for Plastic, SF-XX for Specialist, FA-XX for Fabric, SAN-XX for Sanitaryware, IRO-XX for Ironmongery, CT-XX for Ceramic Tiles, ST-XX for Stone, PT-XX for Paint based on material type)
              - Area (e.g., Kitchen, Living Room)
              - Location of finish (e.g., Skirting, Wall, Ceiling, Floor)
              - Finish (Specific name from a high/mid-grade supplier, incorporating material type)
              - Supplier and Contact (Recommended high/mid-grade UK supplier with Company Name, Contact Email, and Phone Number)
              - Estimated price per sqm in pounds (realistic UK market price for high/mid-grade products)
              - Type (General category like Timber, Metal, Glass, Plastic, Fabric, Sanitaryware, Ironmongery, Ceramic Tiles, Paint, etc.)
              
              IMPORTANT CODE MAPPING:
              - Timber/Wood: Use TI-XX (or WD-XX for legacy compatibility)
              - Metal/Steel: Use MT-XX
              - Glass: Use GL-XX
              - Plastic/PVC: Use PL-XX
              - Fabric/Textile: Use FA-XX
              - Sanitaryware/Bathroom: Use SAN-XX
              - Ironmongery/Hardware: Use IRO-XX
              - Specialist materials: Use SF-XX
              - Ceramic Tiles: Use CT-XX
              - Stone/Marble: Use ST-XX
              - Paint/Wallpaper: Use PT-XX
              
              IMPORTANT: 
              - Focus on identifying *all* visible materials in the image (aim for at least 8-10 distinct items).
              - Ensure codes strictly follow the format: TI/MT/GL/PL/SF/FA/SAN/IRO/CT/ST/PT-XX (where XX is a two-digit number).
              - Provide realistic UK market pricing estimates for high or mid-grade products.
              - Prioritize high or mid-grade suppliers, NOT low-grade products.
              - Supplier details MUST include Company Name, Contact Email, and Phone Number, combined into a single string.
              - Use appropriate material type names (Timber, Metal, Glass, Plastic, Fabric, Sanitaryware, Ironmongery, etc.)
              
              Return the data as a JSON array of objects with this exact structure:
              [
                {
                  "code": "TI-01",
                  "area": "Kitchen",
                  "location": "Floor",
                  "finish": "Prime Grade European Oak Flooring (Product Code: OAK-FLR-01)",
                  "supplierAndContact": "Junckers UK (sales@junckers.co.uk, 01376 534700)",
                  "pricePerSqm": {
                    "low": 70,
                    "mid": 95,
                    "high": 120
                  },
                  "type": "Timber"
                }
              ]
              
              Identify all visible materials from the image. Provide realistic UK market pricing estimates for high/mid-grade products.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
    });

    console.log('✅ OpenAI API response received');
    const content = response.choices[0]?.message?.content;
    
    console.log('📝 OpenAI response content length:', content?.length || 0);
    
    if (!content) {
      console.log('❌ No content in OpenAI response');
      throw new Error('No response from OpenAI');
    }

    let materials;
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        materials = JSON.parse(jsonMatch[0]);
      } else {
        materials = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse OpenAI response:', content);
      console.error('Parse error:', parseError);
      materials = [{
        code: "WD-01",
        location: "General",
        finish: "Standard Grade",
        supplier: "Travis Perkins",
        contactInfo: "0345 0268 268",
        pricePerSqm: {
          low: 25,
          mid: 45,
          high: 65
        },
        type: "Material"
      }];
    }

    console.log('🎉 Successfully generated materials:', materials.length, 'items');
    
    const materialsWithPrefixes = materials.map((material: BIMItem) => {
      const lowerFinish = material.finish?.toLowerCase() || '';
      const lowerType = material.type?.toLowerCase() || '';
      const lowerLocation = material.location?.toLowerCase() || '';
      const lowerArea = material.area?.toLowerCase() || '';
      
      // Check if material already has a valid code prefix
      let codePrefix = 'UN';
      if (material.code && material.code.includes('-')) {
        const existingPrefix = material.code.split('-')[0];
        // Valid prefixes that we recognize
        const validPrefixes = ['TI', 'WD', 'MT', 'GL', 'PL', 'SF', 'FA', 'SAN', 'IRO', 'CT', 'PT', 'ST', 'UN'];
        if (validPrefixes.includes(existingPrefix)) {
          codePrefix = existingPrefix;
        }
      }
      
      // If no valid code prefix found, determine from material type, finish, location, and area
      if (codePrefix === 'UN') {
        // Combine all text fields for better detection
        const allText = `${lowerFinish} ${lowerType} ${lowerLocation} ${lowerArea}`.toLowerCase();
        
        // Fabric/Textile materials (Upholstery, Curtains, Linen, etc.)
        if (allText.includes('upholstery') || allText.includes('curtain') || allText.includes('linen') ||
            allText.includes('fabric') || allText.includes('textile') || allText.includes('velvet') ||
            allText.includes('cloth') || allText.includes('drapery')) {
          codePrefix = 'FA';
        }
        // Timber/Wood materials (Cabinetry, Skirting, MDF, Veneer, etc.)
        else if (allText.includes('cabinetry') || allText.includes('cabinet') || allText.includes('skirting') ||
                 allText.includes('mdf') || allText.includes('veneer') || allText.includes('wood') ||
                 allText.includes('oak') || allText.includes('walnut') || allText.includes('timber') ||
                 allText.includes('pine') || allText.includes('maple') || allText.includes('cherry') ||
                 allText.includes('plywood') || allText.includes('chipboard') || allText.includes('particle board')) {
          codePrefix = 'TI';
        }
        // Metal materials
        else if (allText.includes('metal') || allText.includes('steel') || allText.includes('aluminium') ||
                 allText.includes('aluminum') || allText.includes('brass') || allText.includes('copper')) {
          codePrefix = 'MT';
        }
        // Glass materials
        else if (allText.includes('glass') || allText.includes('mirror')) {
          codePrefix = 'GL';
        }
        // Plastic materials
        else if (allText.includes('plastic') || allText.includes('pvc') || allText.includes('acrylic') ||
                 allText.includes('polyethylene') || allText.includes('polypropylene')) {
          codePrefix = 'PL';
        }
        // Sanitaryware
        else if (allText.includes('sanitary') || allText.includes('bathroom') || allText.includes('toilet') ||
                 allText.includes('sink') || allText.includes('basin') || allText.includes('tap') ||
                 allText.includes('faucet') || allText.includes('shower')) {
          codePrefix = 'SAN';
        }
        // Ironmongery/Hardware
        else if (allText.includes('ironmongery') || allText.includes('hardware') || allText.includes('handle') ||
                 allText.includes('hinge') || allText.includes('lock') || allText.includes('knob') ||
                 allText.includes('pull') || allText.includes('catch')) {
          codePrefix = 'IRO';
        }
        // Specialist materials
        else if (allText.includes('specialist') || allText.includes('special')) {
          codePrefix = 'SF';
        }
        // Ceramic Tiles
        else if (allText.includes('tile') || allText.includes('ceramic') || allText.includes('porcelain')) {
          codePrefix = 'CT';
        }
        // Stone materials
        else if (allText.includes('stone') || allText.includes('marble') || allText.includes('granite') ||
                 allText.includes('quartz') || allText.includes('limestone') || allText.includes('slate')) {
          codePrefix = 'ST';
        }
        // Paint/Wallpaper
        else if (allText.includes('paint') || allText.includes('wallpaper') || allText.includes('plaster') ||
                 allText.includes('primer') || allText.includes('coating')) {
          codePrefix = 'PT';
        }
      }

      let materialType = material.type;
      if (!materialType) {
        const allText = `${lowerFinish} ${lowerType} ${lowerLocation} ${lowerArea}`.toLowerCase();
        
        if (allText.includes('upholstery') || allText.includes('curtain') || allText.includes('linen') ||
            allText.includes('fabric') || allText.includes('textile') || allText.includes('velvet')) {
          materialType = 'Fabric';
        }
        else if (allText.includes('cabinetry') || allText.includes('cabinet') || allText.includes('skirting') ||
                 allText.includes('mdf') || allText.includes('veneer') || allText.includes('wood') ||
                 allText.includes('oak') || allText.includes('timber') || allText.includes('walnut') ||
                 allText.includes('pine') || allText.includes('maple') || allText.includes('cherry')) {
          materialType = 'Timber';
        }
        else if (allText.includes('marble') || allText.includes('stone') || allText.includes('granite') ||
                 allText.includes('quartz') || allText.includes('limestone') || allText.includes('slate')) {
          materialType = 'Stone';
        }
        else if (allText.includes('tile') || allText.includes('ceramic') || allText.includes('porcelain')) {
          materialType = 'Ceramic Tiles';
        }
        else if (allText.includes('paint') || allText.includes('wallpaper') || allText.includes('plaster')) {
          materialType = 'Paint';
        }
        else if (allText.includes('glass') || allText.includes('mirror')) {
          materialType = 'Glass';
        }
        else if (allText.includes('metal') || allText.includes('steel') || allText.includes('aluminium') ||
                 allText.includes('aluminum') || allText.includes('brass')) {
          materialType = 'Metal';
        }
        else if (allText.includes('plastic') || allText.includes('pvc') || allText.includes('acrylic')) {
          materialType = 'Plastic';
        }
        else if (allText.includes('sanitary') || allText.includes('bathroom') || allText.includes('toilet') ||
                 allText.includes('sink') || allText.includes('basin')) {
          materialType = 'Sanitaryware';
        }
        else if (allText.includes('ironmongery') || allText.includes('hardware') || allText.includes('handle') ||
                 allText.includes('hinge')) {
          materialType = 'Ironmongery';
        }
        else if (allText.includes('specialist') || allText.includes('special')) {
          materialType = 'Specialist';
        }
        else {
          materialType = 'Unknown';
        }
      }

      return {
        ...material,
        codePrefix: codePrefix,
        type: materialType,
        pricePerSqm: {
          low: Math.round(material.pricePerSqm?.low || 50),
          mid: Math.round(material.pricePerSqm?.mid || 80),
          high: Math.round(material.pricePerSqm?.high || 110)
        }
      };
    });

    const groupedMaterials = materialsWithPrefixes.reduce((acc: Record<string, (BIMItem & { codePrefix: string })[]>, material: BIMItem & { codePrefix: string }) => {
      (acc[material.codePrefix] = acc[material.codePrefix] || []).push(material);
      return acc;
    }, {} as Record<string, (BIMItem & { codePrefix: string })[]>);

    const materialsWithContiguousCodes: (BIMItem & { codePrefix: string })[] = [];
    for (const prefix in groupedMaterials) {
      if (Object.prototype.hasOwnProperty.call(groupedMaterials, prefix)) {
        const group = groupedMaterials[prefix];
        group.forEach((material: BIMItem & { codePrefix: string }, idx: number) => {
          material.code = `${prefix}-${String(idx + 1).padStart(2, '0')}`;
          materialsWithContiguousCodes.push(material);
        });
      }
    }

    materialsWithContiguousCodes.sort((a, b) => {
      if (a.codePrefix < b.codePrefix) return -1;
      if (a.codePrefix > b.codePrefix) return 1;
      
      const getCodeNumber = (code: string) => parseInt(code.split('-')[1], 10);
      return getCodeNumber(a.code) - getCodeNumber(b.code);
    });

    console.log('🔍 Adding real UK suppliers...');
    const suppliersData = [
      { name: 'Junckers UK', email: 'sales@junckers.co.uk', contact: '01376 534700' },
      { name: 'Porcelanosa', email: 'info@porcelanosa.co.uk', contact: '0333 003 4000' },
      { name: 'Farrow & Ball', email: 'info@farrow-ball.com', contact: '01202 876123' },
      { name: 'VitrA Bathrooms', email: 'sales@vitra.co.uk', contact: '01235 750990' },
      { name: 'Amtico', email: 'info@amtico.com', contact: '0116 204 1000' },
      { name: 'Topps Tiles', email: 'customer.service@toppstiles.co.uk', contact: '0800 014 2935' },
      { name: 'Graham & Brown', email: 'info@grahambrown.com', contact: '0808 168 3795' },
      { name: 'Altro', email: 'info@altro.com', contact: '01462 707600' },
      { name: 'Forbo Flooring', email: 'info@forbo.com', contact: '01773 744121' }
    ];
    
    const materialsWithSuppliers = materialsWithContiguousCodes.map((material, index) => {
      const assignedSupplier = suppliersData[index % suppliersData.length];
      
      const supplierAndContactString = 
        `${assignedSupplier.name} (${assignedSupplier.email}, ${assignedSupplier.contact})`;

      return {
        ...material,
        supplierAndContact: supplierAndContactString,
      };
    });
    
    console.log('✅ Real UK suppliers added');
    return NextResponse.json({ materials: materialsWithSuppliers });

  } catch (error: unknown) {
    console.error('❌ Error generating materials:', error);

    let details = 'Unknown error';
    let type = 'Error';

    if (error instanceof Error) {
      details = error.message;
      type = error.constructor?.name || 'Error';
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      try {
        console.error('Error details:', JSON.stringify(error));
      } catch {
        console.error('Error details: (unserializable)');
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to generate materials',
        details,
        type
      },
      { status: 500 }
    );
  }
}

